"use client";

import { useState } from "react";
import { truncateWords } from "@/lib/gap-analysis-text";
import { cn } from "@/lib/utils";

type ExpandableTextProps = {
  text: string;
  maxWords?: number;
  className?: string;
  textClassName?: string;
};

/** Preview long copy with a Show more / Show less control instead of a hard ellipsis. */
export function ExpandableText({
  text,
  maxWords = 36,
  className,
  textClassName,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const { preview, truncated } = truncateWords(normalized, maxWords);
  const visible = expanded || !truncated ? normalized : preview;

  return (
    <div className={cn(className)}>
      <p className={cn("whitespace-pre-wrap break-words", textClassName)}>{visible}</p>
      {truncated ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
