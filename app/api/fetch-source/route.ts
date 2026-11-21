import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/lib/http";
import { fetchSourceContents, MAX_FETCH_URLS } from "@/lib/exa-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 声で質問するのfetch_sourceツール呼び出しから叩かれる。出典1件以上(最大
// MAX_FETCH_URLS件)の本文を、Exaの/contentsで1回のリクエストにまとめて
// 取得して返す薄いプロキシ。

export async function POST(req: NextRequest) {
  const env = requireEnv(req, ["EXA_API_KEY"] as const);
  if (env instanceof NextResponse) return env;
  const { EXA_API_KEY: exaApiKey } = env;

  const body = await req.json().catch(() => null);
  const urls = Array.isArray(body?.urls)
    ? body.urls.filter((u: unknown): u is string => typeof u === "string").map((u: string) => u.trim())
    : [];
  if (urls.length === 0 || urls.some((u: string) => !/^https?:\/\//.test(u))) {
    return NextResponse.json(
      { error: "有効なURLを1件以上指定してください。" },
      { status: 400 }
    );
  }
  if (urls.length > MAX_FETCH_URLS) {
    return NextResponse.json(
      { error: `URLは一度に${MAX_FETCH_URLS}件までです。` },
      { status: 400 }
    );
  }

  try {
    const results = await fetchSourceContents(exaApiKey, urls);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
