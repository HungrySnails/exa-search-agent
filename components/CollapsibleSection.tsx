import type { ReactNode } from "react";

/**
 * A toggle button ("▼ 開く" / "▲ たたむ") that shows/hides its content,
 * shared by Search mode's article list and Agent mode's citation list.
 *
 * `forceOpenAtDesktop` hides the toggle and always shows the content at the
 * 2xl breakpoint (used by Search mode, where the desktop sidebar layout has
 * room to show articles expanded by default).
 */
export function CollapsibleSection({
  label,
  open,
  onToggle,
  forceOpenAtDesktop = false,
  toggleClassName = "mt-4",
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  forceOpenAtDesktop?: boolean;
  toggleClassName?: string;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={`${toggleClassName} flex w-full items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-300 active:bg-neutral-800 ${
          forceOpenAtDesktop ? "2xl:hidden" : ""
        }`}
      >
        <span>{label}</span>
        <span className="text-xs text-neutral-500">{open ? "▲ たたむ" : "▼ 開く"}</span>
      </button>
      <div
        className={`${open ? "mt-4 block" : "hidden"} ${
          forceOpenAtDesktop ? "2xl:mt-0 2xl:block" : ""
        }`}
      >
        {children}
      </div>
    </>
  );
}
