"use client";

import { useRef } from "react";
import { truncateWords } from "@/lib/gap-analysis-text";
import { formatGapSummaryAsMarkdown } from "@/lib/markdown-format";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Button } from "@/components/ui/button";

type GapSummaryCellProps = {
  summary: string;
  policyName: string;
  maxWords?: number;
  className?: string;
};

export function GapSummaryCell({ summary, policyName, maxWords = 40, className }: GapSummaryCellProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { preview, truncated } = truncateWords(summary, maxWords);

  return (
    <div className={cn("mt-2", className)}>
      <p className="break-words text-sm text-muted-foreground">{preview}</p>
      {truncated ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-1 h-auto px-0 text-xs text-primary underline-offset-4 hover:underline"
          onClick={() => dialogRef.current?.showModal()}
        >
          Read full summary
        </Button>
      ) : null}
      <dialog
        ref={dialogRef}
        className="max-w-2xl rounded-lg border bg-background p-0 shadow-lg backdrop:bg-black/50 open:animate-in"
      >
        <form method="dialog" className="flex flex-col gap-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Gap Analysis Summary</h2>
            <p className="text-sm text-muted-foreground">{policyName}</p>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-3">
            <MarkdownContent text={summary} format={formatGapSummaryAsMarkdown} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="outline">Close</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
