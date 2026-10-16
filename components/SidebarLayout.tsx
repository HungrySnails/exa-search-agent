import type { ReactNode } from "react";

/**
 * Shared two-column layout for both modes: a sticky sidebar (query form,
 * summary card, TTS panel) on desktop, stacked single-column on mobile/tablet.
 */
export function SidebarLayout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="2xl:grid 2xl:grid-cols-[420px_minmax(0,1fr)] 2xl:items-start 2xl:gap-10">
      <div className="2xl:sticky 2xl:top-8 2xl:self-start">{sidebar}</div>
      <div className="2xl:min-w-0">{children}</div>
    </div>
  );
}
