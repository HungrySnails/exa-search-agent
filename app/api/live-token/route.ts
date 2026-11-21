import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/lib/http";
import { prepareLiveContext } from "@/lib/live-context";
import { buildSetup, isValidVoiceName, type LiveCitation } from "@/lib/live-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_TOKENS_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

const MAX_CONTEXT_CHARS = 200000;
// Agent modeのクエリ欄の入力を想定した上限(レポート本文よりずっと短い)。
const MAX_ORIGINAL_QUERY_CHARS = 2000;
// 参照元一覧(fetch_sourceの対象)として渡せる形のものだけ残す。件数も、
// 音声対話の文脈が肥大化しないよう一応上限を設ける。
const MAX_CITATIONS = 50;

interface RequestBody {
  context?: string;
  citations?: unknown;
  originalQuery?: string;
  voiceName?: string;
}

function parseCitations(value: unknown): LiveCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (c): c is { url: string; title?: unknown } =>
        !!c && typeof c === "object" && typeof (c as { url?: unknown }).url === "string"
    )
    .map((c) => ({
      url: c.url,
      title: typeof c.title === "string" ? c.title : null,
    }))
    .slice(0, MAX_CITATIONS);
}

export async function POST(req: NextRequest) {
  const env = requireEnv(req, ["GEMINI_API_KEY"] as const);
  if (env instanceof NextResponse) return env;
  const { GEMINI_API_KEY: apiKey } = env;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSONの形式が不正です。" }, { status: 400 });
  }

  const context = typeof body.context === "string" ? body.context : "";
  if (!context.trim()) {
    return NextResponse.json({ error: "context を指定してください。" }, { status: 400 });
  }
  if (context.length > MAX_CONTEXT_CHARS) {
    return NextResponse.json({ error: "context が長すぎます。" }, { status: 400 });
  }

  const originalQuery =
    typeof body.originalQuery === "string" ? body.originalQuery.trim() : "";
  if (originalQuery.length > MAX_ORIGINAL_QUERY_CHARS) {
    return NextResponse.json({ error: "originalQuery が長すぎます。" }, { status: 400 });
  }

  const citations = parseCitations(body.citations);
  const voiceName =
    typeof body.voiceName === "string" && isValidVoiceName(body.voiceName)
      ? body.voiceName
      : undefined;
  const setup = buildSetup({
    contextText: prepareLiveContext(context),
    citations,
    originalQuery: originalQuery || undefined,
    voiceName,
  });

  const now = Date.now();
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();

  const tokenResult = await issueAuthToken({ apiKey, setup, expireTime, newSessionExpireTime });

  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: "トークン発行に失敗しました。", detail: tokenResult.detail },
      { status: 502 }
    );
  }

  return NextResponse.json({
    token: tokenResult.name,
    setup,
    // SHOW_GEMINI_USAGE=1のときだけ、クライアントがトークン数を積算・報告する
    // (search/agentでのGeminiトークン表示と同じオプトインに揃える)。
    showUsage: process.env.SHOW_GEMINI_USAGE === "1",
  });
}

// REST の AuthToken リソースの項目名は `bidiGenerateContentSetup` + `fieldMask`
// (https://ai.google.dev/api/live)。
async function issueAuthToken(params: {
  apiKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup: any;
  expireTime: string;
  newSessionExpireTime: string;
}): Promise<{ ok: true; name: string } | { ok: false; detail: unknown }> {
  const { apiKey, setup, expireTime, newSessionExpireTime } = params;

  const res = await fetch(AUTH_TOKENS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      uses: 1,
      expireTime,
      newSessionExpireTime,
      bidiGenerateContentSetup: setup,
      // tools を落とすとfetch_sourceの関数宣言がトークンに焼き込まれず、
      // クライアント側がsetupをそのまま再送しても無言で無効化される。
      fieldMask:
        "model,generationConfig,systemInstruction,tools,realtimeInputConfig,sessionResumption,contextWindowCompression,inputAudioTranscription,outputAudioTranscription",
    }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    return { ok: false, detail };
  }

  const json = await res.json();
  return { ok: true, name: json.name };
}
