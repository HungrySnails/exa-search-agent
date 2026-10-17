import { NextRequest, NextResponse } from "next/server";
import { requireEnv, validateQuery } from "@/lib/http";
import { parseSearchParams } from "@/lib/exa-options";
import { containsJapanese, translateSearchQueryToEnglish } from "@/lib/gemini";
import { geminiUsageForResponse, newGeminiUsage, runWithGeminiUsage } from "@/lib/gemini-usage";
import { runNewsSearch } from "@/lib/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// deep-reasoning は10〜60秒程度かかることがあるため、タイムアウトを延長する。
export const maxDuration = 60;

const MAX_QUERY_CHARS = 200;

export async function POST(req: NextRequest) {
  const env = requireEnv(req, ["EXA_API_KEY", "GEMINI_API_KEY"] as const);
  if (env instanceof NextResponse) return env;
  const { EXA_API_KEY: exaApiKey, GEMINI_API_KEY: geminiApiKey } = env;

  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const queryError = validateQuery(query, { label: "検索語", maxChars: MAX_QUERY_CHARS });
  if (queryError) return queryError;
  const params = parseSearchParams(body);
  if (typeof params === "string") {
    return NextResponse.json({ error: params }, { status: 400 });
  }

  try {
    const usage = newGeminiUsage();
    const payload = await runWithGeminiUsage(usage, async () => {
      // Exa's results skew toward English-language sources, so a Japanese
      // query is translated first to get better matches.
      const exaQuery = containsJapanese(query)
        ? await translateSearchQueryToEnglish(geminiApiKey, query)
        : query;
      return runNewsSearch(exaApiKey, geminiApiKey, exaQuery, params, `「${query}」`);
    });
    return NextResponse.json({ ...payload, query, geminiUsage: geminiUsageForResponse(usage) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
