import { NextRequest, NextResponse } from "next/server";
import { requireEnv, validateQuery } from "@/lib/http";
import { runDeepResearch, type ResearchEffort } from "@/lib/exa-agent";
import { parseEffort } from "@/lib/exa-options";
import { geminiUsageForResponse, newGeminiUsage, runWithGeminiUsage, type GeminiUsage } from "@/lib/gemini-usage";
import {
  containsJapanese,
  isJapaneseText,
  summarizeToJapanese,
  translateResearchQueryToEnglish,
  translateToJapanese,
  translateTitlesToJapanese,
} from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby plan's function duration cap (with fluid compute) is 300s;
// this is set to that ceiling since high-effort agent runs can take minutes.
export const maxDuration = 300;

const MAX_QUERY_CHARS = 500;

// Emitted as newline-delimited JSON so the client can show progress while
// the Exa Agent run is still polling, instead of waiting for one big response.
type StreamEvent =
  | { type: "status"; phase: "translating_query" | "starting" }
  | { type: "status"; phase: "running"; status: string; elapsedMs: number }
  | { type: "status"; phase: "translating_result" }
  | { type: "status"; phase: "summarizing" }
  | {
      type: "result";
      text: string;
      citations: { url: string; title: string | null }[];
      costDollars: number | null;
      /** Empty when summarization failed; see notices. */
      summary: string;
      /** Partial failures after the paid Exa run, shown to the user as-is. */
      notices: string[];
      /** Gemini tokens used for this run; null unless SHOW_GEMINI_USAGE=1. */
      geminiUsage: GeminiUsage | null;
    }
  | { type: "error"; error: string };

export async function POST(req: NextRequest) {
  const env = requireEnv(req, ["EXA_API_KEY", "GEMINI_API_KEY"] as const);
  if (env instanceof NextResponse) return env;
  const { EXA_API_KEY: exaApiKey, GEMINI_API_KEY: geminiApiKey } = env;

  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const effort: ResearchEffort = parseEffort(body?.effort) ?? "minimal";

  const queryError = validateQuery(query, { label: "調査内容", maxChars: MAX_QUERY_CHARS });
  if (queryError) return queryError;

  const encoder = new TextEncoder();
  const usage = newGeminiUsage();
  // The stream's start callback runs inside this scope, so every Gemini
  // call it awaits adds to `usage`.
  const stream = runWithGeminiUsage(usage, () => new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        // 日本語クエリは調査前にGeminiで英語の指示文に翻訳する。クエリが
        // 英語でもExa Agentの出力は英語になるため、結果の翻訳はクエリの
        // 言語に関わらず常に行う（下のtranslating_resultブロック）。
        const exaQuery = containsJapanese(query)
          ? await (async () => {
              send({ type: "status", phase: "translating_query" });
              return translateResearchQueryToEnglish(geminiApiKey, query);
            })()
          : query;

        send({ type: "status", phase: "starting" });
        const result = await runDeepResearch(exaApiKey, exaQuery, effort, (progress) => {
          send({
            type: "status",
            phase: "running",
            status: progress.status,
            elapsedMs: progress.elapsedMs,
          });
        });

        // Exa Agentの出力は基本的に英語（クエリが英語ならなおさら）だが、
        // 既に日本語で返ってくる場合もあるため、本文・タイトルとも日本語を
        // 含んでいなければ翻訳する。クエリの言語には関係なく常にチェックする。
        let text = result.text;
        const citations = result.citations.map((c) => ({ ...c }));
        const needsTextTranslation = !isJapaneseText(result.text);
        const titleTargets = citations
          .map((c, i) => ({ i, title: c.title }))
          .filter(
            (t): t is { i: number; title: string } =>
              !!t.title && !isJapaneseText(t.title)
          );

        // The Exa run is already paid for at this point, so a Gemini failure
        // below degrades to the English original instead of failing the
        // whole request and discarding the report.
        const notices: string[] = [];
        const reasonOf = (err: unknown) => (err instanceof Error ? err.message : "不明なエラー");

        if (needsTextTranslation || titleTargets.length > 0) {
          send({ type: "status", phase: "translating_result" });

          const [textResult, titlesResult] = await Promise.allSettled([
            needsTextTranslation
              ? translateToJapanese(geminiApiKey, result.text)
              : Promise.resolve(result.text),
            titleTargets.length > 0
              ? translateTitlesToJapanese(
                  geminiApiKey,
                  titleTargets.map((t) => t.title)
                )
              : Promise.resolve<string[]>([]),
          ]);

          if (textResult.status === "fulfilled") {
            text = textResult.value;
          } else {
            notices.push(
              `レポートを日本語に翻訳できなかったため、英語の原文を表示しています（${reasonOf(textResult.reason)}）`
            );
          }
          if (titlesResult.status === "fulfilled") {
            titleTargets.forEach((target, idx) => {
              citations[target.i].title = titlesResult.value[idx];
            });
          } else if (textResult.status === "fulfilled") {
            notices.push(
              `参照元のタイトルを翻訳できなかったため、原文のまま表示しています（${reasonOf(titlesResult.reason)}）`
            );
          }
        }

        send({ type: "status", phase: "summarizing" });
        let summary = "";
        try {
          summary = await summarizeToJapanese(geminiApiKey, text);
        } catch (err) {
          notices.push(`要約を作成できませんでした（${reasonOf(err)}）`);
        }

        send({
          type: "result",
          text,
          citations,
          costDollars: result.costDollars,
          summary,
          notices,
          geminiUsage: geminiUsageForResponse(usage),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラー";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  }));

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
