import { formatElapsed } from "@/lib/format-elapsed";

/** Shared status-message primitives used by both Search and Agent modes. */

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
      {message}
    </p>
  );
}

/** Partial failures where a result is still shown (e.g. translation fell back to English). */
export function NoticeBanner({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="mt-4 space-y-1 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}

/** Result footer: what the run cost and how long the user waited for it. */
export function CostLine({
  dollars,
  elapsedMs,
}: {
  dollars: number | null;
  elapsedMs: number | null;
}) {
  const parts = [
    dollars !== null ? `コスト: $${dollars.toFixed(3)}` : null,
    elapsedMs !== null ? `所要 ${formatElapsed(elapsedMs)}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return <p className="mt-3 text-right text-[11px] text-neutral-500">{parts.join(" ・ ")}</p>;
}

/** Collapsed note listing Exa features this app deliberately leaves out. */
export function ScopeNote({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-4 rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-500">
      <summary className="cursor-pointer select-none">
        ※ Exaで選べる機能をすべて網羅してはいません
      </summary>
      <div className="mt-2 space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-10 text-center text-sm text-neutral-500 2xl:mt-0">{children}</p>
  );
}
