"use client";

// 調査レポートへの音声質疑応答パネル。LIVE_QA.md §6参照。
// 評価は体感で行うため、ログ記録・ダウンロード機能は持たない
// (ラボのRecorderのような計測機構は、この組み込みでは作らない)。
// 接続・マイク・再生・再接続は共通フック(lib/use-live-session.ts)が受け持つ。

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { MicLevelMeter } from "@/components/live/MicLevelMeter";
import { SessionControls } from "@/components/live/SessionControls";
import { TranscriptList } from "@/components/live/TranscriptList";
import { VoicePicker, useVoiceSelection } from "@/components/live/VoicePicker";
import {
  useLiveSession,
  type ConnectionState,
  type FunctionCall,
  type FunctionResponse,
} from "@/lib/use-live-session";
import type { GeminiUsage } from "@/lib/gemini-usage";

interface LiveCitation {
  url: string;
  title: string | null;
}

// /api/fetch-sourceが返す1件分(成功時はtext、失敗時はerrorが入る)。
interface FetchedSourceResult {
  url: string;
  title: string | null;
  text: string | null;
  error: string | null;
}

interface FetchedSource {
  url: string;
  title: string | null;
  text: string;
}

export interface LiveQaPanelHandle {
  // 新しい調査開始時に親(page.tsx)から呼ぶ。接続中ならマイク・再生ごと終了する。
  end: () => void;
}

// fetch_source待ちの間、マイク送信を止めるときのキー(use-live-session.tsのpauseMic)。
const MIC_PAUSE_FETCH = "fetch_source";

function LiveQaPanel(
  {
    rawText,
    citations,
    originalQuery,
    password,
    onBeforeStart,
    onProposeNextTopic,
    onUsage,
  }: {
    rawText: string;
    citations: LiveCitation[];
    // Agent/Search modeで確定した元のテーマ、または手動入力時のクエリ(任意)。
    originalQuery?: string;
    password: string;
    // 接続開始の直前に呼ぶ(モード切替などで多重接続を避けたい場合に使う)。
    onBeforeStart?: () => void;
    onProposeNextTopic: (queryJa: string, queryEn: string) => void;
    // 終了時に、その接続で積算されたGeminiのトークン数を報告する(届いていれば)。
    onUsage?: (usage: GeminiUsage) => void;
  },
  ref: React.ForwardedRef<LiveQaPanelHandle>
) {
  const { gender, voiceName, changeGender, setVoiceName } = useVoiceSelection();
  // fetch_source呼び出し(出典の本文取得)が進行中かどうか。
  const [fetchingSource, setFetchingSource] = useState(false);
  // fetch_sourceで実際に取得できた本文。カードとして画面に表示する。
  const [fetchedSources, setFetchedSources] = useState<FetchedSource[]>([]);
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(new Set());
  // propose_next_topicが呼ばれた回数(ユーザーへのフィードバック表示用)。
  const [proposedCount, setProposedCount] = useState(0);

  const live = useLiveSession({
    password,
    buildTokenBody: () => ({ context: rawText, citations, originalQuery, voiceName }),
    onToolCalls: handleToolCalls,
    // 2026-11-17: システム指示には「接続したら自分から話しかける」とあるが、モデルが
    // 生成を始める入力が無いと黙ったままのことがあった(作者の確認による)。setupComplete
    // の直後に合図のテキストを送り、話し始めるきっかけを作る。文字起こし・画面には出さない。
    onSetupComplete: () => {
      live.sendText("[接続しました]", { echo: false });
    },
    onBeforeStart,
    onReset: () => {
      setFetchingSource(false);
      setFetchedSources([]);
      setExpandedUrls(new Set());
      setProposedCount(0);
    },
  });
  const {
    status,
    transcripts,
    errorMessage,
    micLevel,
    transcriptCollapsed,
    setTranscriptCollapsed,
    usage,
  } = live;

  useImperativeHandle(ref, () => ({ end: handleEnd }));

  // アンマウント時・終了時にその時点のusage・onUsage・end()を読めるよう、
  // 毎回のレンダーでrefに入れ直す(クロージャの古い値を掴まないようにする)。
  const latestRef = useRef({ end: live.end, usage, onUsage });
  latestRef.current = { end: live.end, usage, onUsage };

  // SearchMode/AgentModeはタブ切替で丸ごとアンマウントされるため、接続中にタブを
  // 切り替えても放置されないよう、アンマウント時にも終了させる。
  useEffect(() => {
    return () => {
      const { end, usage: u, onUsage: report } = latestRef.current;
      if (u.inputTokens + u.outputTokens > 0) report?.(u);
      end();
    };
  }, []);

  // モデルがfetch_sourceを呼んできたら、/api/fetch-source(Exaの/contents)で
  // 本文を(複数URLをまとめて)取って送り返す。取得中はマイク送信を止め、パネルに表示する。
  // 1件のURLが失敗しても、他の成功分は返す。
  // propose_next_topicは非同期の取得を伴わないので、その場で処理する。
  async function handleToolCalls(calls: FunctionCall[]): Promise<FunctionResponse[]> {
    // propose_next_topicだけの呼び出しでは、何も取得しないので「取得中」表示・マイク停止はしない。
    const hasFetchSource = calls.some((call) => call.name === "fetch_source");
    if (hasFetchSource) {
      setFetchingSource(true);
      live.pauseMic(MIC_PAUSE_FETCH);
    }
    const errorMessages: string[] = [];
    const functionResponses = await Promise.all(
      calls.map(async (call): Promise<FunctionResponse> => {
        if (call.name === "propose_next_topic") {
          const queryJa =
            typeof call.args?.query_ja === "string" ? call.args.query_ja.trim() : "";
          const queryEn =
            typeof call.args?.query_en === "string" ? call.args.query_en.trim() : "";
          if (!queryJa || !queryEn) {
            return {
              id: call.id,
              name: call.name,
              response: { error: "query_ja と query_en の両方を指定してください。" },
            };
          }
          onProposeNextTopic(queryJa, queryEn);
          setProposedCount((n) => n + 1);
          return { id: call.id, name: call.name, response: { ok: true } };
        }
        if (call.name !== "fetch_source") {
          errorMessages.push("未対応の関数です。");
          return { id: call.id, name: call.name, response: { error: "未対応の関数です。" } };
        }
        const urls = Array.isArray(call.args?.urls)
          ? call.args.urls.filter((u): u is string => typeof u === "string")
          : [];
        if (urls.length === 0) {
          errorMessages.push("URLが指定されていません。");
          return { id: call.id, name: call.name, response: { error: "URLが指定されていません。" } };
        }
        try {
          const res = await fetch("/api/fetch-source", {
            method: "POST",
            headers: { "content-type": "application/json", "x-app-password": password },
            body: JSON.stringify({ urls }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "取得に失敗しました。");
          const results: FetchedSourceResult[] = data.results;
          const succeeded = results.filter((r) => r.text);
          const failed = results.filter((r) => !r.text);
          if (succeeded.length > 0) {
            setFetchedSources((prev) => [
              ...prev.filter((s) => !succeeded.some((r) => r.url === s.url)),
              ...succeeded.map((r) => ({ url: r.url, title: r.title, text: r.text as string })),
            ]);
          }
          failed.forEach((f) => errorMessages.push(`${f.url}: ${f.error ?? "取得に失敗しました。"}`));
          const resultPayload = results.map((r) =>
            r.text ? { url: r.url, text: r.text } : { url: r.url, error: r.error }
          );
          return { id: call.id, name: call.name, response: { results: resultPayload } };
        } catch (err) {
          const message = err instanceof Error ? err.message : "取得に失敗しました。";
          errorMessages.push(message);
          return { id: call.id, name: call.name, response: { error: message } };
        }
      })
    );
    if (errorMessages.length > 0) {
      live.setErrorMessage(`出典の取得に失敗しました: ${errorMessages.join(", ")}`);
    }
    setFetchingSource(false);
    live.resumeMic(MIC_PAUSE_FETCH);
    return functionResponses;
  }

  function toggleExpanded(url: string) {
    setExpandedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function sendRealtimeText(text: string) {
    live.sendText(text, { echo: true });
  }

  function handleStart() {
    live.start();
  }

  function handleEnd() {
    if (usage.inputTokens + usage.outputTokens > 0) onUsage?.(usage);
    live.end();
    setFetchingSource(false);
  }

  function handleReconnect() {
    live.reconnect();
  }

  const statusLabel: Record<ConnectionState, string> = {
    idle: "未接続",
    connecting: "接続中…",
    connected: "応答できます",
    closed: "終了しました",
    error: "エラー",
  };

  return (
    <section className="mt-6 rounded-xl border border-violet-900 bg-violet-950/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-violet-300">
          このレポートについて声で質問する
        </span>
        <span className="text-xs text-neutral-500">{statusLabel[status]}</span>
      </div>

      {(status === "idle" || status === "closed" || status === "error") && (
        <VoicePicker
          accent="violet"
          gender={gender}
          voiceName={voiceName}
          onGenderChange={changeGender}
          onVoiceChange={setVoiceName}
        />
      )}

      {(status === "connecting" || status === "connected") && (
        <MicLevelMeter accent="violet" level={micLevel} />
      )}

      <SessionControls
        accent="violet"
        status={status}
        startLabel="声で質問する"
        onStart={handleStart}
        onEnd={handleEnd}
        onReconnect={handleReconnect}
      />

      {status === "connected" && (
        <button
          onClick={() => sendRealtimeText("このレポートの要点を30秒ほどで話してください")}
          className="mb-3 w-full rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 active:opacity-80"
        >
          要点を聞く
        </button>
      )}

      {fetchingSource && (
        <p className="mb-3 text-xs text-neutral-500">出典の本文を取得中…</p>
      )}

      {proposedCount > 0 && (
        <p className="mb-3 text-xs text-violet-300">
          次の調査テーマを、上のクエリ欄に反映しました(
          {proposedCount > 1 ? `${proposedCount}回更新` : "1回更新"})。
        </p>
      )}

      {errorMessage && <p className="mb-3 text-xs text-red-400">{errorMessage}</p>}

      {fetchedSources.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {fetchedSources.map((source) => {
            const expanded = expandedUrls.has(source.url);
            return (
              <div
                key={source.url}
                className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-2"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(source.url)}
                  className="flex w-full items-start justify-between gap-2 text-left"
                >
                  <span className="text-xs font-medium text-neutral-200">
                    {source.title ?? source.url}
                  </span>
                  <span className="shrink-0 text-[11px] text-neutral-500">
                    {expanded ? "▲ たたむ" : "▼ 本文を見る"}
                  </span>
                </button>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">{source.url}</p>
                {expanded && (
                  <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
                    {source.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TranscriptList
        accent="violet"
        transcripts={transcripts}
        collapsed={transcriptCollapsed}
        onToggle={() => setTranscriptCollapsed((c) => !c)}
      />
    </section>
  );
}

export default forwardRef(LiveQaPanel);
