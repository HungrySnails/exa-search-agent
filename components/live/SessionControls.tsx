// 開始/終了のボタンと、エラー時の「再接続」ボタン。

import type { ConnectionState } from "@/lib/use-live-session";
import { ACCENT_CLASSES, type Accent } from "./accent";

export function SessionControls({
  accent,
  status,
  startLabel,
  onStart,
  onEnd,
  onReconnect,
}: {
  accent: Accent;
  status: ConnectionState;
  startLabel: string;
  onStart: () => void;
  onEnd: () => void;
  onReconnect: () => void;
}) {
  return (
    <div className="mb-3 flex gap-2">
      {status === "idle" || status === "closed" || status === "error" ? (
        <button
          onClick={onStart}
          className={`flex-1 rounded-lg ${ACCENT_CLASSES[accent].primary} px-4 py-3 text-sm font-semibold text-white active:opacity-80`}
        >
          {startLabel}
        </button>
      ) : (
        <button
          onClick={onEnd}
          disabled={status === "connecting"}
          className="flex-1 rounded-lg border border-neutral-700 px-4 py-3 text-sm font-semibold text-neutral-300 active:opacity-80 disabled:opacity-50"
        >
          終了
        </button>
      )}
      {status === "error" && (
        <button
          onClick={onReconnect}
          className={`rounded-lg border ${ACCENT_CLASSES[accent].secondary} px-4 py-3 text-sm font-semibold active:opacity-80`}
        >
          再接続
        </button>
      )}
    </div>
  );
}
