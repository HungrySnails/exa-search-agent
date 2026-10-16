const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const JAPANESE_RE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
// Kanji alone can't tell Japanese apart from Chinese; kana is the reliable
// signal that a text is actually Japanese (used to decide whether output
// already is Japanese and a translation pass can be skipped).
const KANA_RE = /[぀-ヿｦ-ﾟ]/;

export function containsJapanese(text: string): boolean {
  return JAPANESE_RE.test(text);
}

export function isJapaneseText(text: string): boolean {
  return KANA_RE.test(text);
}

function describeGeminiError(status: number, body: string): string {
  let detail = "";
  try {
    detail = JSON.parse(body)?.error?.message ?? "";
  } catch {
    // Non-JSON body; the status code alone is shown.
  }
  const suffix = `（HTTP ${status}${detail ? `: ${detail.slice(0, 150)}` : ""}）`;
  if (status === 429) {
    return `Geminiの利用上限に達しました。レート制限かクレジット残高不足の可能性があります。1日の上限は太平洋時間0時（日本時間16〜17時）にリセットされます${suffix}`;
  }
  if (status === 404) {
    return `Geminiのモデル「${GEMINI_MODEL}」が見つかりません。提供終了の可能性があります${suffix}`;
  }
  if (status === 400 || status === 401 || status === 403) {
    return `Geminiがリクエストを拒否しました。APIキーの設定を確認してください${suffix}`;
  }
  if (status >= 500) return `Geminiが一時的に応答できません。時間をおいて再試行してください${suffix}`;
  return `Gemini APIエラー${suffix}`;
}

export async function generateText(
  apiKey: string,
  prompt: string,
  generationConfig: Record<string, unknown> = { temperature: 0 }
): Promise<string> {
  const res = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(`Gemini API error (${res.status}): ${errBody.slice(0, 500)}`);
    throw new Error(describeGeminiError(res.status, errBody));
  }

  const data = await res.json();
  const output: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!output) throw new Error("Gemini応答が空です");
  return output.trim();
}

/** Translates a Japanese search phrase into concise English search keywords. Used by Search mode (Exa `/search`). */
export async function translateSearchQueryToEnglish(
  apiKey: string,
  text: string
): Promise<string> {
  return generateText(
    apiKey,
    `次の日本語の検索語句を、Web検索エンジンに適した簡潔な英語のキーワードに翻訳してください。翻訳結果のみを出力し、説明や前置きは含めないでください。\n\n${text}`
  );
}

/** Translates a Japanese research request into an English instruction for a web research agent. Used by Agent mode (Exa Agent Runs). */
export async function translateResearchQueryToEnglish(
  apiKey: string,
  text: string
): Promise<string> {
  return generateText(
    apiKey,
    `次の日本語の調査依頼を、Web調査エージェントに適した簡潔な英語の指示文に翻訳してください。翻訳結果のみを出力し、説明や前置きは含めないでください。\n\n${text}`
  );
}

/** Translates an English report back into natural Japanese, keeping its structure. */
export async function translateToJapanese(
  apiKey: string,
  text: string
): Promise<string> {
  return generateText(
    apiKey,
    `次の英語のレポートを、自然な日本語に翻訳してください。見出しや段落構成・改行はできるだけ保持し、翻訳結果のみを出力してください。説明や前置きは含めないでください。\n\n${text}`
  );
}

/** Summarizes a Japanese report into a short bullet-point digest. */
export async function summarizeToJapanese(
  apiKey: string,
  text: string
): Promise<string> {
  return generateText(
    apiKey,
    `次の日本語の調査レポートを、要点を3〜6個の箇条書きで簡潔にまとめてください。前置きや「以下に要約します」等の説明は含めず、箇条書きのみを出力してください。\n\n${text}`
  );
}

/**
 * Translates citation titles to Japanese in one Gemini call. Titles that
 * fail to parse back out of the response are left untranslated rather than
 * dropped, so a malformed response never breaks the citation list.
 */
export async function translateTitlesToJapanese(
  apiKey: string,
  titles: string[]
): Promise<string[]> {
  if (titles.length === 0) return [];
  const numbered = titles.map((title, i) => `${i + 1}. ${title}`).join("\n");
  const prompt = `次はWeb記事のタイトル一覧です。各タイトルを自然な日本語に翻訳してください。番号はそのまま維持し、「番号. 翻訳後のタイトル」の形式で、入力と同じ行数だけ出力してください。説明や前置きは含めないでください。\n\n${numbered}`;

  const output = await generateText(apiKey, prompt);
  const translated = [...titles];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)[.)]\s*(.+)$/);
    if (!match) continue;
    const index = Number(match[1]) - 1;
    if (index >= 0 && index < translated.length) translated[index] = match[2];
  }
  return translated;
}
