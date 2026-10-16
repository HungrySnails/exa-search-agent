import { exaFetch } from "@/lib/exa-client";
import type { SearchParams } from "@/lib/exa-options";
import { generateText } from "@/lib/gemini";

export const MAX_CHARS_PER_ARTICLE = 2500;

export type ExaResult = {
  title: string | null;
  url: string;
  publishedDate: string | null;
  author: string | null;
  text: string | null;
};

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedDate: string | null;
  summary: string;
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Dates come from the UI as JST calendar days.
function jstDayBoundary(date: string, endOfDay: boolean): string {
  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+09:00`).toISOString();
}

export async function searchExa(
  apiKey: string,
  query: string,
  params: SearchParams
): Promise<{ results: ExaResult[]; costDollars: number | null }> {
  const contents: Record<string, unknown> = {
    text: { maxCharacters: MAX_CHARS_PER_ARTICLE },
  };
  if (params.maxAgeHours !== null) contents.maxAgeHours = params.maxAgeHours;

  const body: Record<string, unknown> = {
    query,
    type: params.type,
    numResults: params.numResults,
    contents,
  };
  if (params.category) body.category = params.category;
  if (params.includeDomains.length > 0) body.includeDomains = params.includeDomains;
  if (params.excludeDomains.length > 0) body.excludeDomains = params.excludeDomains;
  if (params.startPublishedDate) {
    body.startPublishedDate = jstDayBoundary(params.startPublishedDate, false);
  }
  if (params.endPublishedDate) {
    body.endPublishedDate = jstDayBoundary(params.endPublishedDate, true);
  }
  if (params.userLocation) body.userLocation = params.userLocation;
  if (params.moderation) body.moderation = true;

  const data = await exaFetch(apiKey, "/search", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    results: (data.results ?? []) as ExaResult[],
    costDollars: typeof data.costDollars?.total === "number" ? data.costDollars.total : null,
  };
}

export async function summarizeWithGemini(
  apiKey: string,
  articles: ExaResult[],
  topic: string,
  multiPerspective: boolean = false
): Promise<{ overview: string; summaries: string[] }> {
  if (articles.length === 0) return { overview: "", summaries: [] };

  const articlesBlock = articles
    .map((a, i) => {
      const body = (a.text ?? "").slice(0, MAX_CHARS_PER_ARTICLE);
      return `[記事${i}]\nタイトル: ${a.title ?? "(不明)"}\n本文:\n${body}`;
    })
    .join("\n\n---\n\n");

  const instructions = multiPerspective
    ? `1. 各記事の要約: それぞれ4〜5文、400文字程度。記事の性格（最新の発表・技術的進展、背景・歴史的経緯、政策動向、分析・考察など）が伝わるように書くこと
2. 総括: 各記事の視点の違い（最新動向と背景・政策的文脈など）を踏まえ、${topic}を多角的に捉えた全体像を5〜6文、600文字程度でまとめたもの`
    : `1. 各記事の要約: それぞれ4〜5文、400文字程度
2. 総括: 全記事を俯瞰し、${topic}の全体的な傾向や注目点を5〜6文、600文字程度でまとめたもの`;

  const prompt = `あなたは編集者です。以下は${topic}について検索して得られたWeb上の記事・資料です。次の2つを日本語で作成してください。
${instructions}

出力は必ず次のJSON形式のみで返してください（説明文や前置きは不要）:
{"overview": "...", "articles": [{"index": 0, "summary": "..."}, {"index": 1, "summary": "..."}, ...]}

記事一覧:
${articlesBlock}`;

  async function requestSummary() {
    const text = await generateText(apiKey, prompt, {
      responseMimeType: "application/json",
      temperature: 0.3,
    });
    return JSON.parse(text) as {
      overview?: string;
      articles?: { index: number; summary: string }[];
    };
  }

  // Gemini occasionally returns malformed JSON despite responseMimeType, so
  // one retry is attempted before giving up.
  let parsed: { overview?: string; articles?: { index: number; summary: string }[] };
  try {
    parsed = await requestSummary();
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    try {
      parsed = await requestSummary();
    } catch (retryErr) {
      if (retryErr instanceof SyntaxError) {
        throw new Error("Gemini応答のJSON解析に失敗しました");
      }
      throw retryErr;
    }
  }

  const summaries = new Array(articles.length).fill("");
  for (const item of parsed.articles ?? []) {
    if (
      typeof item.index === "number" &&
      item.index >= 0 &&
      item.index < articles.length
    ) {
      summaries[item.index] = item.summary ?? "";
    }
  }
  return { overview: parsed.overview ?? "", summaries };
}

/** Runs Exa search and Gemini summarization, returning the UI-ready payload. */
export async function runNewsSearch(
  exaApiKey: string,
  geminiApiKey: string,
  query: string,
  params: SearchParams,
  topic: string
): Promise<{
  overview: string;
  items: NewsItem[];
  fetchedAt: string;
  costDollars: number | null;
  notices: string[];
}> {
  const { results, costDollars } = await searchExa(exaApiKey, query, params);

  // The Exa search is already paid for, so a Gemini failure returns the
  // articles without summaries rather than discarding them.
  const notices: string[] = [];
  let overview = "";
  let summaries: string[] = [];
  try {
    ({ overview, summaries } = await summarizeWithGemini(
      geminiApiKey,
      results,
      topic,
      params.type.startsWith("deep")
    ));
  } catch (err) {
    const reason = err instanceof Error ? err.message : "不明なエラー";
    notices.push(`要約を作成できなかったため、記事一覧のみ表示しています（${reason}）`);
  }

  const items: NewsItem[] = results.map((r, i) => ({
    title: r.title ?? "(タイトル不明)",
    url: r.url,
    source: hostnameOf(r.url),
    publishedDate: r.publishedDate,
    summary: summaries[i] || "(要約を取得できませんでした)",
  }));

  return { overview, items, fetchedAt: new Date().toISOString(), costDollars, notices };
}
