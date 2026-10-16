import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tried in order; the next model is used only when the previous one fails.
const GEMINI_TTS_MODELS = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-3.1-flash-tts-preview",
];
const GEMINI_TTS_VOICE = "Kore";

// Large enough for one report segment.
const MAX_TEXT_CHARS = 8000;

function pcmToWav(
  pcmData: Buffer,
  sampleRate: number,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

export async function POST(req: NextRequest) {
  const env = requireEnv(req, ["GEMINI_API_KEY"] as const);
  if (env instanceof NextResponse) return env;
  const { GEMINI_API_KEY: geminiApiKey } = env;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "textが必要です。" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: "テキストが長すぎます。" },
      { status: 400 }
    );
  }

  let wavBuffer: Buffer | null = null;
  let lastError = "不明なエラー";
  for (const model of GEMINI_TTS_MODELS) {
    try {
      wavBuffer = await synthesizeWithModel(model, text, geminiApiKey);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "不明なエラー";
      console.warn(`TTS model ${model} failed, trying next: ${lastError}`);
    }
  }

  if (!wavBuffer) {
    return NextResponse.json({ error: lastError }, { status: 502 });
  }
  return new NextResponse(new Uint8Array(wavBuffer), {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "cache-control": "no-store",
    },
  });
}

async function synthesizeWithModel(
  model: string,
  text: string,
  apiKey: string
): Promise<Buffer> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } },
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Gemini TTS API error (${res.status}, ${model}): ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0];
  const base64Audio: string | undefined = part?.inlineData?.data;
  const mimeType: string = part?.inlineData?.mimeType ?? "";
  if (!base64Audio) throw new Error(`Gemini応答に音声データがありません (${model})`);

  const audioBuffer = Buffer.from(base64Audio, "base64");
  // Some models already return a WAV container; only raw PCM needs a header.
  if (mimeType.startsWith("audio/wav")) return audioBuffer;
  const rateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  return pcmToWav(audioBuffer, sampleRate);
}
