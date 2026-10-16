// Builds the text handed to the share sheet / clipboard when a summary or
// report is sent onward (typically pasted into a new email). URLs are always
// written out as plain text rather than links.

export type ExportCitation = { url: string; title: string | null };

// Unwraps markdown links and autolinks so every URL appears as plain text:
// [label](url) -> "label (url)", <url> -> "url". A link whose label is the
// URL itself collapses to just the URL. A space is added after the URL when
// text follows it directly (common in Japanese), since mail apps' URL
// auto-detection would otherwise swallow that text into the URL.
export function unlinkMarkdown(text: string): string {
  const spaceIfGlued = (out: string, offset: number, match: string, whole: string) =>
    /\S/.test(whole.charAt(offset + match.length)) ? `${out} ` : out;
  return text
    .replace(
      /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
      (match, label: string, url: string, offset: number, whole: string) =>
        spaceIfGlued(
          !label.trim() || label.trim() === url ? url : `${label} (${url})`,
          offset,
          match,
          whole,
        ),
    )
    .replace(/<(https?:\/\/[^\s>]+)>/g, (match, url: string, offset: number, whole: string) =>
      spaceIfGlued(url, offset, match, whole),
    );
}

// Markdown body for the share sheet / plain-text clipboard: heading, the
// content with links unwrapped, and (for the report) the citation list.
export function buildShareMarkdown(
  heading: string,
  body: string,
  citations: ExportCitation[] = [],
): string {
  const parts = [`# ${heading}`, unlinkMarkdown(body).trim()];
  if (citations.length > 0) {
    const list = citations
      .map((c, i) => `${i + 1}. ${c.title ?? c.url}\n   ${c.url}`)
      .join("\n");
    parts.push(`## 参照元\n\n${list}`);
  }
  return parts.join("\n\n") + "\n";
}
