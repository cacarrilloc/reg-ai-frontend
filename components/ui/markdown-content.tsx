"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { normalizeMarkdownLists } from "@/lib/markdown-format";

export type MarkdownContentProps = {
  text: string;
  className?: string;
  format?: (text: string) => string;
};

export const markdownContentClassName =
  "min-w-0 max-w-full break-words [overflow-wrap:anywhere] space-y-3 text-sm leading-relaxed text-muted-foreground";

export const markdownComponents: Components = {
  p({ children }) {
    return <p className="break-words leading-relaxed [overflow-wrap:anywhere]">{children}</p>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-foreground">{children}</strong>;
  },
  ul({ children }) {
    return (
      <ul className="my-2 list-outside list-disc space-y-1.5 pl-6 marker:text-muted-foreground">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="my-2 list-outside list-decimal space-y-1.5 pl-6 marker:text-muted-foreground">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return (
      <li className="break-words pl-1 leading-relaxed [overflow-wrap:anywhere] [&>p]:my-0">
        {children}
      </li>
    );
  },
};

export function MarkdownContent({
  text,
  className,
  format = normalizeMarkdownLists,
}: MarkdownContentProps) {
  const markdown = format(text);
  if (!markdown) {
    return null;
  }

  return (
    <div className={[markdownContentClassName, className].filter(Boolean).join(" ")}>
      <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
    </div>
  );
}
