"use client";

import { MarkdownContent } from "@/components/ui/markdown-content";
import { formatEventSummaryAsMarkdown } from "@/lib/event-summary-markdown";

type EventSummaryMarkdownProps = {
  text: string;
  className?: string;
};

export function EventSummaryMarkdown({ text, className }: EventSummaryMarkdownProps) {
  return (
    <MarkdownContent
      text={text}
      className={className}
      format={formatEventSummaryAsMarkdown}
    />
  );
}
