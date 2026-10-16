"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildShareMarkdown, type ExportCitation } from "@/lib/share-export";

// Renderers for the rich-text clipboard copy. Mail clients ignore <style>
// and class names, so everything is inline, in a light theme. Links render
// as their text only: by this point the markdown has been unlinked, so a
// link's text is the URL itself (GFM still auto-links bare URLs).
const MAIL_CELL_STYLE = { border: "1px solid #ccc", padding: "4px 8px", textAlign: "left" } as const;
const mailMarkdownComponents = {
  a: ({ children }: React.ComponentProps<"a">) => <>{children}</>,
  table: ({ children }: React.ComponentProps<"table">) => (
    <table style={{ borderCollapse: "collapse", margin: "8px 0" }}>{children}</table>
  ),
  th: ({ children }: React.ComponentProps<"th">) => (
    <th style={{ ...MAIL_CELL_STYLE, background: "#f2f2f2" }}>{children}</th>
  ),
  td: ({ children }: React.ComponentProps<"td">) => (
    <td style={{ ...MAIL_CELL_STYLE, verticalAlign: "top" }}>{children}</td>
  ),
  pre: ({ children }: React.ComponentProps<"pre">) => (
    <pre style={{ background: "#f4f4f4", padding: "8px", whiteSpace: "pre-wrap" }}>{children}</pre>
  ),
  code: ({ children }: React.ComponentProps<"code">) => (
    <code style={{ fontFamily: "monospace", background: "#f4f4f4" }}>{children}</code>
  ),
  blockquote: ({ children }: React.ComponentProps<"blockquote">) => (
    <blockquote
      style={{ borderLeft: "3px solid #ccc", margin: "8px 0", paddingLeft: "8px", color: "#555" }}
    >
      {children}
    </blockquote>
  ),
};

// Renders markdown to an HTML string synchronously (into a detached node),
// so the clipboard write still happens inside the click's user gesture,
// which Safari requires.
function renderMailHtml(markdown: string): string {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mailMarkdownComponents}>
        {markdown}
      </ReactMarkdown>,
    );
  });
  const html = container.innerHTML;
  root.unmount();
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">${html}</div>`;
}

/**
 * "共有" (OS share sheet, Markdown text) and "書式付きコピー" (rich-text +
 * plain-text clipboard) actions for a summary/report card. Both require a
 * secure context (HTTPS or localhost) — the share button hides itself when
 * `navigator.share` isn't available (e.g. plain-HTTP LAN dev server).
 */
export function ShareActions({
  heading,
  body,
  citations,
}: {
  heading: string;
  body: string;
  citations?: ExportCitation[];
}) {
  const [canShare, setCanShare] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  function flash(message: string) {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 2500);
  }

  async function handleShare() {
    try {
      await navigator.share({ title: heading, text: buildShareMarkdown(heading, body, citations) });
    } catch (e) {
      // AbortError just means the user closed the share sheet.
      if ((e as Error).name !== "AbortError") flash("共有できませんでした");
    }
  }

  async function handleRichCopy() {
    const markdown = buildShareMarkdown(heading, body, citations);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([renderMailHtml(markdown)], { type: "text/html" }),
            "text/plain": new Blob([markdown], { type: "text/plain" }),
          }),
        ]);
        flash("書式付きでコピーしました");
      } else {
        await navigator.clipboard.writeText(markdown);
        flash("テキストでコピーしました");
      }
    } catch {
      flash("コピーできませんでした");
    }
  }

  const buttonClass =
    "rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 active:opacity-80";
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      {notice && <span className="text-[11px] text-neutral-500">{notice}</span>}
      {canShare && (
        <button type="button" onClick={handleShare} className={buttonClass}>
          共有
        </button>
      )}
      <button type="button" onClick={handleRichCopy} className={buttonClass}>
        書式付きコピー
      </button>
    </div>
  );
}
