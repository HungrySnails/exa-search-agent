"use client";

// Gemini Live APIとの声の対話セッション(接続・再接続・マイク・再生・文字起こし)を
// まとめたフック。LiveQaPanel・ThemeTalkPanelで共有する。LIVE_SHARED.md参照。
// パネルごとに違うのは、トークン要求のbodyと、関数呼び出しの処理だけ。

import { useRef, useState } from "react";
import { MicCapture } from "@/lib/audio/capture";
import { PcmPlayer } from "@/lib/audio/player";
import { useWakeLock } from "@/lib/use-wake-lock";
import type { GeminiUsage } from "@/lib/gemini-usage";

export type ConnectionState = "idle" | "connecting" | "connected" | "closed" | "error";

export interface TranscriptEntry {
  role: "model" | "user";
  text: string;
}

export interface FunctionCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface FunctionResponse {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

export interface TurnCompleteInfo {
  interrupted: boolean;
  hadAudio: boolean;
}

export interface LiveSessionOptions {
  password: string;
  // /api/live-tokenに送るbody。接続(再接続を含む)のたびに呼ぶ。
  buildTokenBody: () => Record<string, unknown>;
  // モデルからの関数呼び出しを処理し、送り返す応答を返す。送信はフックが行う。
  onToolCalls: (calls: FunctionCall[]) => Promise<FunctionResponse[]>;
  // モデルのターンが終わったとき(turnComplete)に呼ぶ。interrupted: そのターンが割り込みで
  // 打ち切られたか。hadAudio: そのターンに音声があったか。発言の文字起こしの直後などには、
  // 音声の無いturnCompleteも届く。「モデルが話し終えた」とみなせるのは、両方を満たすときだけ。
  onTurnComplete?: (info: TurnCompleteInfo) => void;
  // setupCompleteを受けた直後(接続完了)に呼ぶ。モデルに自分から話しかけさせたい場合、
  // ここでsendText(..., { echo: false })の合図を送る(モデルは生成を始める入力が無いと
  // 自分から話し始めないことがあるため)。
  onSetupComplete?: () => void;
  // 接続開始の直前に呼ぶ。もう一方のパネルが接続中なら、ここで終了させる
  // (両方同時にLive接続が立ち、両方が音声に反応する不整合を防ぐ)。
  onBeforeStart?: () => void;
  // 新規開始のときに、パネル固有の状態を初期化する。
  onReset?: () => void;
}

// endAfterPlayback()で、鳴り終わる予定の時刻に足す余裕。
const END_AFTER_PLAYBACK_MARGIN_MS = 300;
// waitForModelIdle()の確認間隔と、待つ上限。
const MODEL_IDLE_POLL_MS = 200;
const MODEL_IDLE_TIMEOUT_MS = 15_000;

const WS_HOST = "generativelanguage.googleapis.com";
const WS_PATH =
  "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export function useLiveSession(options: LiveSessionOptions) {
  // WebSocketのイベントやマイクのコールバックは、接続した時点の関数を掴んだまま後で呼ばれる。
  // 後から変わったprops(声・案など)を古い値で読まないよう、毎回のレンダーでrefに入れ直し、
  // 呼ぶときはrefから読む。
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatus] = useState<ConnectionState>("idle");
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // マイクが実際に音を拾えているかを目で確認するための、保存しない一時的な音量表示。
  const [micLevel, setMicLevel] = useState(0);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(true);
  // サーバーメッセージに載るusageMetadataの積算(届かないサーバーバージョンもあるため0のままもあり得る)。
  const [usage, setUsage] = useState<GeminiUsage>({ inputTokens: 0, outputTokens: 0 });

  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const resumptionHandleRef = useRef<string | null>(null);
  // SHOW_GEMINI_USAGE=1のサーバーでのみusageMetadataを積算する(live-tokenの応答で届く)。
  const showUsageRef = useRef(false);
  const userEndedRef = useRef(false);
  const autoReconnectedRef = useRef(false);
  const turnBoundaryPendingRef = useRef(true);
  // 関数呼び出しの待ち(ブロッキング呼び出し)などの間にマイクの音声を送り続けると、
  // 発話検出(START_OF_ACTIVITY_INTERRUPTS)が保留中の関数呼び出しを無効化しうる。
  // 止める理由ごとにキーを入れ、1つでも残っていれば送信しない(理由ごとに分けておくと、
  // 一方の後始末がもう一方の停止まで解いてしまう取り違えが起きない)。
  // stateだとマイクのコールバック内で古い値を掴むので、refで同期的に見る。
  const micPauseKeysRef = useRef<Set<string>>(new Set());
  // endAfterPlayback()で予約した終了のタイマー。
  const pendingEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 終了待ちの間にユーザーが話し始めたら、その応答のturnCompleteまで終了を持ち越す。
  const endOnNextTurnCompleteRef = useRef(false);
  // モデルの応答が続いている間(最初の音声からturnComplete・interruptedまで)true。
  // 応答の音声はほぼ実時間で届くため、予約済みの再生が一瞬尽きても、応答が終わったとは限らない。
  const modelTurnActiveRef = useRef(false);
  // 今のターンが割り込みで打ち切られたか・音声があったか(turnCompleteでonTurnCompleteに渡す)。
  // 話している途中に新しいテキストや発言が届くと、サーバーは応答を打ち切り(interrupted)、
  // その打ち切った応答のturnCompleteを送ってくる。これを「話し終えた」と取り違えないために使う。
  const turnInterruptedRef = useRef(false);
  const turnHadAudioRef = useRef(false);
  // テキストを送ってから、その返事のturnCompleteが届くまでtrue。送ってから返事の音声が届くまで
  // 0.5秒ほど間があり、その隙はmodelTurnActiveRefだけでは「話していない」と見えてしまうため。
  const awaitingReplyRef = useRef(false);

  // 声の対話中は、画面が自動で消灯しないようにする。
  useWakeLock(status === "connected");

  async function connect() {
    setErrorMessage(null);
    setStatus("connecting");

    const player = new PcmPlayer();
    playerRef.current = player;
    void player.resume();

    startMic();

    try {
      const res = await fetch("/api/live-token", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-password": optionsRef.current.password,
        },
        body: JSON.stringify(optionsRef.current.buildTokenBody()),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "トークン発行に失敗しました。");
        setStatus("error");
        micRef.current?.stop();
        micRef.current = null;
        return;
      }
      showUsageRef.current = data.showUsage === true;

      const wsUrl = `wss://${WS_HOST}${WS_PATH}?access_token=${encodeURIComponent(data.token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        const setupToSend = resumptionHandleRef.current
          ? {
              ...(data.setup as Record<string, unknown>),
              sessionResumption: { handle: resumptionHandleRef.current },
            }
          : data.setup;
        ws.send(JSON.stringify({ setup: setupToSend }));
      });

      ws.addEventListener("message", async (event: MessageEvent) => {
        const raw =
          typeof event.data === "string" ? event.data : await (event.data as Blob).text();
        try {
          handleServerMessage(JSON.parse(raw));
        } catch {
          // 不正なメッセージは無視する(体感での評価が目的のため、詳細なログは残さない)。
        }
      });

      ws.addEventListener("error", () => {
        setErrorMessage("接続エラーが発生しました。");
      });

      ws.addEventListener("close", (event) => {
        micRef.current?.stop();
        micRef.current = null;
        if (userEndedRef.current) {
          setStatus("closed");
          return;
        }
        // 約10分で切れる(1011)ことが多い。再開ハンドルがあれば1回だけ自動再接続する。
        // LIVE_QA.md §2・§6参照。
        if (resumptionHandleRef.current && !autoReconnectedRef.current) {
          autoReconnectedRef.current = true;
          void connect();
          return;
        }
        setErrorMessage(`接続が切れました(code=${event.code})。`);
        setStatus("error");
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "接続に失敗しました。");
      setStatus("error");
      micRef.current?.stop();
      micRef.current = null;
    }
  }

  function handleServerMessage(msg: Record<string, unknown>) {
    const player = playerRef.current;

    if (msg.setupComplete) {
      setStatus("connected");
      optionsRef.current.onSetupComplete?.();
      return;
    }

    const sc = msg.serverContent as
      | {
          modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
          outputTranscription?: { text?: string };
          inputTranscription?: { text?: string };
          interrupted?: boolean;
          turnComplete?: boolean;
        }
      | undefined;

    if (sc) {
      const parts = sc.modelTurn?.parts ?? [];
      for (const part of parts) {
        const audioData = part.inlineData?.data;
        if (audioData && player) {
          modelTurnActiveRef.current = true;
          turnHadAudioRef.current = true;
          if (turnBoundaryPendingRef.current) {
            player.beginTurn();
            turnBoundaryPendingRef.current = false;
          }
          player.enqueueBase64Pcm(audioData);
        }
      }
      if (sc.outputTranscription?.text) {
        const text = sc.outputTranscription.text;
        setTranscripts((prev) => [...prev, { role: "model", text }]);
      }
      if (sc.inputTranscription?.text) {
        const text = sc.inputTranscription.text;
        setTranscripts((prev) => [...prev, { role: "user", text }]);
        // 終了待ちの間に話しかけられたら、終了を取りやめ、その応答が終わるまで持ち越す。
        if (pendingEndTimerRef.current) {
          clearPendingEnd();
          endOnNextTurnCompleteRef.current = true;
        }
      }
      if (sc.interrupted) {
        player?.interrupt();
        turnBoundaryPendingRef.current = true;
        modelTurnActiveRef.current = false;
        turnInterruptedRef.current = true;
      }
      if (sc.turnComplete) {
        turnBoundaryPendingRef.current = true;
        modelTurnActiveRef.current = false;
        const info: TurnCompleteInfo = {
          interrupted: turnInterruptedRef.current,
          hadAudio: turnHadAudioRef.current,
        };
        turnInterruptedRef.current = false;
        turnHadAudioRef.current = false;
        // 打ち切られたターンのturnCompleteは、送ったテキストへの返事の終わりではない。
        if (!info.interrupted) awaitingReplyRef.current = false;
        // 持ち越した終了は、モデルが実際に話し終えたターン(打ち切られず、音声があった)で行う。
        if (endOnNextTurnCompleteRef.current && !info.interrupted && info.hadAudio) {
          endOnNextTurnCompleteRef.current = false;
          endAfterPlayback();
        }
        optionsRef.current.onTurnComplete?.(info);
      }
    }

    const resumptionUpdate = msg.sessionResumptionUpdate as
      | { newHandle?: string }
      | undefined;
    if (resumptionUpdate?.newHandle) {
      resumptionHandleRef.current = resumptionUpdate.newHandle;
    }

    const toolCall = msg.toolCall as { functionCalls?: FunctionCall[] } | undefined;
    if (toolCall?.functionCalls?.length) {
      void handleToolCalls(toolCall.functionCalls);
    }

    // generateContentのusageMetadataと同じ項目名(promptTokenCount等)。届くタイミング・
    // 届くかどうかはAPIバージョン依存のため、無ければ0のまま進める。累積か差分かが
    // 未確認なため、安全側(過大表示より過小表示)に倒し、届いた値で上書きする(加算しない)。
    const usageMetadata = msg.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
      | undefined;
    if (usageMetadata && showUsageRef.current) {
      const count = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
      setUsage({
        inputTokens: count(usageMetadata.promptTokenCount),
        outputTokens:
          count(usageMetadata.candidatesTokenCount) + count(usageMetadata.thoughtsTokenCount),
      });
    }

    if (msg.error) {
      setErrorMessage(`サーバーエラー: ${JSON.stringify(msg.error)}`);
    }
  }

  async function handleToolCalls(calls: FunctionCall[]) {
    const functionResponses = await optionsRef.current.onToolCalls(calls);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
      // 関数の結果を受けたモデルの返事も、テキストへの返事と同じく待つ対象にする。
      awaitingReplyRef.current = true;
    }
  }

  function startMic() {
    if (micRef.current) return;
    const mic = new MicCapture();
    micRef.current = mic;
    mic
      .start((base64, rms) => {
        setMicLevel(rms);
        // 止める理由が残っている間は送信しない。音量メーターの表示は続ける。
        if (micPauseKeysRef.current.size > 0) return;
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              realtimeInput: { audio: { data: base64, mimeType: "audio/pcm;rate=16000" } },
            })
          );
        }
      })
      .catch((err) => {
        setErrorMessage(`マイクを開始できませんでした: ${(err as Error).message}`);
      });
  }

  function pauseMic(key: string) {
    micPauseKeysRef.current.add(key);
  }

  function resumeMic(key: string) {
    micPauseKeysRef.current.delete(key);
  }

  // テキストを送る。echo: trueなら、自分の発言として文字起こしに載せ、ターン境界を立てる
  // (「要点を聞く」など)。システムからの通知([状況])はechoしない。
  function sendText(text: string, { echo }: { echo: boolean }) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ realtimeInput: { text } }));
    awaitingReplyRef.current = true;
    if (echo) {
      turnBoundaryPendingRef.current = true;
      setTranscripts((prev) => [...prev, { role: "user", text }]);
    }
  }

  // モデルが話し終えるまで待つ(話しておらず、送ったテキストへの返事を待っている最中でもなく、
  // 再生も残っていない)。話している途中にテキストを送ると、サーバーがその発話を打ち切るため、
  // システムからの通知はこれを待ってから送る。最大でtimeoutMsまで待ち、過ぎたらそのまま進む。
  function waitForModelIdle(timeoutMs = MODEL_IDLE_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const check = () => {
        const ws = wsRef.current;
        const idle =
          !modelTurnActiveRef.current &&
          !awaitingReplyRef.current &&
          (playerRef.current?.remainingPlaybackSeconds ?? 0) <= 0.05;
        if (!ws || ws.readyState !== WebSocket.OPEN || idle || Date.now() >= deadline) {
          resolve();
          return;
        }
        setTimeout(check, MODEL_IDLE_POLL_MS);
      };
      check();
    });
  }

  function clearPendingEnd() {
    if (pendingEndTimerRef.current) {
      clearTimeout(pendingEndTimerRef.current);
      pendingEndTimerRef.current = null;
    }
  }

  // 予約済みの音声が鳴り終わってから接続を終える。turnCompleteの直後にend()を呼ぶと、
  // まだ鳴っていない発話の後半をplayer.close()が止めてしまうおそれがあるため。鳴り終わる
  // 時刻にもう一度残りを確かめ、その間に新しい音声が届いていれば、さらに待つ。
  // (2026-11-15の記録では、音声はほぼ実時間で届き、turnComplete時点の残りは0.01秒以下
  // だった。実時間より速く届く状況への備えとして残している。)
  // その時点でモデルの応答が続いていれば(話しかけられて応答中など)、再生の残りに関係なく
  // 終えず、その応答のturnCompleteで改めて呼ぶ(応答の途中で切れるのを防ぐ)。
  function endAfterPlayback() {
    clearPendingEnd();
    if (modelTurnActiveRef.current) {
      endOnNextTurnCompleteRef.current = true;
      return;
    }
    const remaining = playerRef.current?.remainingPlaybackSeconds ?? 0;
    if (remaining <= 0.05) {
      end();
      return;
    }
    pendingEndTimerRef.current = setTimeout(() => {
      pendingEndTimerRef.current = null;
      endAfterPlayback();
    }, remaining * 1000 + END_AFTER_PLAYBACK_MARGIN_MS);
  }

  function start() {
    if (status === "connecting" || status === "connected") return;
    clearPendingEnd();
    endOnNextTurnCompleteRef.current = false;
    optionsRef.current.onBeforeStart?.();
    userEndedRef.current = false;
    autoReconnectedRef.current = false;
    // 新規接続は前回の再開ハンドルを引き継がない(LIVE_QA.md §2)。
    resumptionHandleRef.current = null;
    turnBoundaryPendingRef.current = true;
    modelTurnActiveRef.current = false;
    turnInterruptedRef.current = false;
    turnHadAudioRef.current = false;
    awaitingReplyRef.current = false;
    micPauseKeysRef.current.clear();
    setTranscripts([]);
    setMicLevel(0);
    setTranscriptCollapsed(true);
    optionsRef.current.onReset?.();
    void connect();
  }

  function end() {
    clearPendingEnd();
    endOnNextTurnCompleteRef.current = false;
    userEndedRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    micPauseKeysRef.current.clear();
    setTranscriptCollapsed(true);
    setStatus("idle");
    setMicLevel(0);
  }

  function reconnect() {
    autoReconnectedRef.current = true;
    void connect();
  }

  return {
    status,
    transcripts,
    errorMessage,
    setErrorMessage,
    micLevel,
    transcriptCollapsed,
    setTranscriptCollapsed,
    usage,
    start,
    end,
    endAfterPlayback,
    reconnect,
    sendText,
    waitForModelIdle,
    pauseMic,
    resumeMic,
  };
}
