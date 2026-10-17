import { useEffect } from "react";

/**
 * Sets the browser tab title while `title` is non-null and restores the
 * previous one afterwards. Tab titles double as the default name when the
 * page is bookmarked or clipped, so a finished search names itself.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

const MAX_TITLE_QUERY_CHARS = 40;

/** "検索語 - Exa Search (即時(instant))": the query is shortened to keep tabs readable. */
export function buildResultTitle(query: string, modeLabel: string): string {
  const chars = Array.from(query.replace(/\s+/g, " ").trim());
  const shortened =
    chars.length > MAX_TITLE_QUERY_CHARS
      ? `${chars.slice(0, MAX_TITLE_QUERY_CHARS).join("")}…`
      : chars.join("");
  return `${shortened} - ${modeLabel}`;
}
