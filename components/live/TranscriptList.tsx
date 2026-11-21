"use client";

// 折りたためる文字起こし一覧。文字起こしが増えたら末尾までスクロールする。

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/lib/use-live-session";
import { ACCENT_CLASSES, type Accent } from "./accent";

export function TranscriptList({
  accent,
  transcripts,
  collapsed,
  onToggle,
}: {
  accent: Accent;
  transcripts: TranscriptEntry[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcripts]);

  if (transcripts.length === 0) return null;

  return (
    <div className="rounded-lg border border-neutral-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] text-neutral-500"
      >
        <span>文字起こし({transcripts.length}件)</span>
        <span>{collapsed ? "▼ 開く" : "▲ たたむ"}</span>
      </button>
      {!collapsed && (
        <div
          ref={listRef}
          className="max-h-48 overflow-y-auto border-t border-neutral-800 p-2 text-xs"
        >
          {transcripts.map((t, i) => (
            <div
              key={i}
              className={t.role === "model" ? ACCENT_CLASSES[accent].modelText : "text-neutral-400"}
            >
              [{t.role === "model" ? "回答" : "自分"}] {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
