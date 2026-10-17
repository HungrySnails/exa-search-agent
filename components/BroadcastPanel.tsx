import type { ReactNode } from "react";
import type { TtsEngine } from "@/hooks/useBroadcast";

const ENGINE_OPTIONS: { id: TtsEngine; label: string }[] = [
  { id: "browser", label: "ブラウザ音声" },
  { id: "gemini", label: "Gemini音声" },
];

export type BroadcastPanelProps = {
  isSpeaking: boolean;
  isPaused: boolean;
  isSynthesizing: boolean;
  playbackDone: boolean;
  replayFromCache: boolean;
  ttsSupported: boolean;
  ttsEngine: TtsEngine;
  ttsError: string | null;
  onEngineChange: (engine: TtsEngine) => void;
  onToggle: () => void;
  onStop: () => void;
  /** Label shown next to the status dot while idle, e.g. "AIニュース読み上げ". */
  idleLabel: string;
  /** Label on the main button in its idle (not-yet-played) state, e.g. "▶ ニュースを読み上げる". */
  playLabel: string;
  /** Rendered after the engine toggle, before the play/stop buttons. */
  beforeControls?: ReactNode;
  /** Rendered after the play/stop buttons and the cache hint. */
  afterControls?: ReactNode;
};

/** The "ON AIR" red-themed TTS playback panel, shared by Search and Agent modes. */
export function BroadcastPanel({
  isSpeaking,
  isPaused,
  isSynthesizing,
  playbackDone,
  replayFromCache,
  ttsSupported,
  ttsEngine,
  ttsError,
  onEngineChange,
  onToggle,
  onStop,
  idleLabel,
  playLabel,
  beforeControls,
  afterControls,
}: BroadcastPanelProps) {
  return (
    <aside aria-label="読み上げ" className="mt-4 rounded-xl border border-red-edge bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full bg-red-500 ${
              isSpeaking && !isPaused ? "animate-pulse" : "opacity-50"
            }`}
          />
          <span className="text-xs font-bold tracking-wider text-red-500">
            {isSpeaking ? (isPaused ? "一時停止中" : "ON AIR") : idleLabel}
          </span>
        </div>
        <div className="flex items-end gap-0.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-1 rounded-full bg-red-500 ${
                isSpeaking && !isPaused ? "animate-bounce" : "h-1 opacity-30"
              }`}
              style={
                isSpeaking && !isPaused
                  ? { height: `${6 + (i % 3) * 4}px`, animationDelay: `${i * 0.1}s` }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        {ENGINE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onEngineChange(opt.id)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${
              ttsEngine === opt.id
                ? "border-red-500 bg-red-sel text-red-on"
                : "border-line-strong text-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {beforeControls}

      {ttsEngine === "browser" && !ttsSupported ? (
        <p className="text-xs text-neutral-500">
          このブラウザは音声読み上げに対応していません。
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onToggle}
            disabled={isSynthesizing}
            className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white active:opacity-80 disabled:opacity-50"
          >
            {isSynthesizing
              ? "音声を生成中…"
              : isSpeaking
                ? isPaused
                  ? "▶ 再開"
                  : "❚❚ 一時停止"
                : playbackDone
                  ? "↻ もう一度、聴き直す"
                  : playLabel}
          </button>
          {isSpeaking && (
            <button
              onClick={onStop}
              className="rounded-lg border border-line-strong px-4 py-3 text-sm font-semibold text-fg-soft active:opacity-80"
            >
              ■ 停止
            </button>
          )}
        </div>
      )}

      {playbackDone && !isSpeaking && ttsEngine === "gemini" && (
        <p className="mt-2 text-xs text-neutral-500">
          {replayFromCache
            ? "キャッシュ済み：API呼び出しなしで再生します"
            : "未生成の部分だけ音声を生成します"}
        </p>
      )}

      {ttsError && <p className="mt-2 text-xs text-red-label">{ttsError}</p>}

      {afterControls}
    </aside>
  );
}
