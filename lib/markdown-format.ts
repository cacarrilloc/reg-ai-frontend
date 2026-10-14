/**
 * Normalize LLM-generated prose into readable markdown lists and paragraphs.
 */
export function normalizeMarkdownLists(text: string): string {
  let formatted = text.replace(/\r\n/g, "\n").trim();
  if (!formatted) {
    return "";
  }

  formatted = formatted.replace(/^[ \t]*•[ \t]+/gm, "- ");
  formatted = formatted.replace(/^[ \t]*\*[ \t]+(?!\*)/gm, "- ");
  formatted = formatted.replace(/[ \t]*•[ \t]+/g, "\n- ");
  formatted = formatted.replace(/[ \t](\d+\.\s+)/g, "\n$1");
  formatted = formatted.replace(/([^\n])\n(- )/g, "$1\n\n$2");
  formatted = formatted.replace(/([^\n])\n(\d+\.\s+)/g, "$1\n\n$2");

  return formatted.replace(/\n{3,}/g, "\n\n").trim();
}

/** Format gap-analysis and review summaries for markdown display. */
export function formatGapSummaryAsMarkdown(text: string): string {
  return normalizeMarkdownLists(text);
}
