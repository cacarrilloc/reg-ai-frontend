import { normalizeMarkdownLists } from "@/lib/markdown-format";

/**
 * Normalize LLM event summaries into readable markdown for display.
 * Existing rows may be one dense paragraph with inline section labels and bullets.
 */
const SECTION_HEADER_PATTERN =
  /\s+\*\*(Business Change|Compliance Impact|Recommended Actions):\*\*/gi;

export function formatEventSummaryAsMarkdown(text: string): string {
  let formatted = text.replace(/\r\n/g, "\n").trim();
  if (!formatted) {
    return "";
  }

  formatted = formatted.replace(
    SECTION_HEADER_PATTERN,
    (_match, label: string) => `\n\n**${label}:**`
  );

  formatted = formatted.replace(
    /\*\*(Business Change|Compliance Impact|Recommended Actions):\*\*[ \t]+(?=\S)/gi,
    "**$1:**\n\n"
  );

  return normalizeMarkdownLists(formatted);
}
