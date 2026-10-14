"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { normalizeImpactScore } from "@/lib/gap-analysis-text";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ExpandableText } from "@/components/ui/expandable-text";

export type GapFindingItem = {
  summary: string;
  rule?: string | null;
  fix?: string | null;
  impact_score?: string;
  sentence?: string | null;
  sentence_label?: string | null;
  display_kind?: "policy" | "marketing" | null;
  finding?: string | null;
  why?: string | null;
  confidence?: string | null;
  options?: string[];
  options_display?: string | null;
};

type GapFindingsToggleProps = {
  count: number;
  open: boolean;
  onToggle: () => void;
  panelId?: string;
  className?: string;
};

export function GapFindingsToggle({
  count,
  open,
  onToggle,
  panelId,
  className,
}: GapFindingsToggleProps) {
  if (count <= 0) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
    >
      <span>{count}</span>
      <ChevronDown
        className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        aria-hidden
      />
      <span className="sr-only">{open ? "Hide gap summaries" : "Show gap summaries"}</span>
    </button>
  );
}

export function GapFindingsList({
  gaps,
  id,
  className,
  startIndex = 0,
}: {
  gaps: GapFindingItem[];
  id?: string;
  className?: string;
  /** 0-based offset so preview slices keep stable "Gap N" labels. */
  startIndex?: number;
}) {
  const items = gaps.filter((item) => item.summary.trim() || item.finding?.trim() || item.why?.trim());
  const marketingTable = items.length > 0 && items.every((item) => item.display_kind === "marketing");

  if (marketingTable) {
    return <MarketingFindingsTable id={id} items={items} className={className} />;
  }

  return (
    <ol id={id} className={cn("space-y-2 text-left", className)}>
      {items.map((gap, index) => (
        <li
          key={`${startIndex + index}-${gap.summary.slice(0, 24)}`}
          className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm"
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">Gap {startIndex + index + 1}</span>
            {gap.impact_score ? <FindingImpactBadge impact={gap.impact_score} /> : null}
          </div>
          <div className="space-y-2 text-sm text-foreground/90">
            {gap.rule?.trim() ? (
              <div>
                <p className="text-[11px] font-medium uppercase text-muted-foreground">Rule</p>
                <ExpandableText text={gap.rule} maxWords={40} textClassName="text-sm" />
              </div>
            ) : null}
            <div>
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Gap</p>
              <ExpandableText text={gap.summary} maxWords={40} textClassName="text-sm" />
            </div>
            {gap.fix?.trim() ? (
              <div>
                <p className="text-[11px] font-medium uppercase text-muted-foreground">Fix</p>
                <ExpandableText text={gap.fix} maxWords={40} textClassName="text-sm" />
              </div>
            ) : null}
          </div>
          {gap.sentence && gap.sentence.trim() !== gap.summary.trim() ? (
            <div className="mt-2">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                {gap.sentence_label?.trim() || "Policy sentence"}
              </p>
              <ExpandableText
                text={gap.sentence}
                maxWords={28}
                textClassName="text-[11px] text-muted-foreground"
              />
            </div>
          ) : null}
        </li>
      ))}
      {items.length === 0 ? (
        <li className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Gap details are not available for this analysis yet. Re-run AI analysis to refresh.
        </li>
      ) : null}
    </ol>
  );
}

function MarketingFindingsTable({
  id,
  items,
  className,
}: {
  id?: string;
  items: GapFindingItem[];
  className?: string;
}) {
  return (
    <div id={id} className={cn("min-w-0 overflow-x-auto rounded-md border", className)}>
      <table className="w-full min-w-[40rem] table-fixed border-collapse text-left text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <th className="w-[18%] px-3 py-2 font-medium">Finding</th>
            <th className="w-[10%] px-3 py-2 font-medium">Rule</th>
            <th className="w-[40%] px-3 py-2 font-medium">Gap</th>
            <th className="w-[12%] px-3 py-2 font-medium">Confidence</th>
            <th className="w-[20%] px-3 py-2 font-medium">Options</th>
          </tr>
        </thead>
        <tbody>
          {items.map((gap, index) => (
            <tr key={`${index}-${(gap.finding || gap.summary).slice(0, 24)}`} className="border-t align-top">
              <td className="px-3 py-3 text-sm font-medium [overflow-wrap:anywhere]">
                {gap.finding || gap.summary}
              </td>
              <td className="px-3 py-3 text-sm [overflow-wrap:anywhere]">{gap.rule}</td>
              <td className="px-3 py-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
                {gap.why || gap.summary}
              </td>
              <td className="px-3 py-3 text-sm">{gap.confidence || "Certain"}</td>
              <td className="px-3 py-3 text-sm [overflow-wrap:anywhere]">
                {gap.options_display || gap.fix || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type GapFindingsDropdownProps = {
  gaps: GapFindingItem[];
  gapCount?: number;
  className?: string;
  /** How many rule/gap/fix sets to show before "Show more". */
  previewCount?: number;
  /** Stable id so lazy-load runs once per analysis, not on every parent render. */
  findingsKey?: string;
  /** When gaps are omitted from the list payload, load them on mount. */
  onLoadFindings?: () => Promise<GapFindingItem[]>;
};

const DEFAULT_PREVIEW_COUNT = 1;

/** Review Queue: preview a few findings, then Show more / Show less. */
export function GapFindingsDropdown({
  gaps,
  gapCount,
  className,
  previewCount = DEFAULT_PREVIEW_COUNT,
  findingsKey,
  onLoadFindings,
}: GapFindingsDropdownProps) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState(() => gaps.filter((item) => item.summary.trim()));
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onLoadFindingsRef = useRef(onLoadFindings);
  const panelId = useId();
  const count = Math.max(gapCount ?? 0, items.length);
  const limit = Math.max(1, previewCount);
  const initialGapsKey = gaps
    .map((item) => item.summary.trim())
    .filter(Boolean)
    .join("\0");

  onLoadFindingsRef.current = onLoadFindings;

  useEffect(() => {
    const next = gaps.filter((item) => item.summary.trim());
    if (next.length > 0) {
      setItems(next);
    }
    // initialGapsKey captures content; avoid depending on gaps[] identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gaps identity churns from `?? []`
  }, [initialGapsKey]);

  useEffect(() => {
    const load = onLoadFindingsRef.current;
    if (!load || (gapCount ?? 0) <= 0) {
      return;
    }
    if (initialGapsKey.length > 0) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void (async () => {
      try {
        const loaded = await load();
        if (cancelled) {
          return;
        }
        setItems(loaded.filter((item) => item.summary.trim()));
      } catch (caught) {
        if (cancelled) {
          return;
        }
        setLoadError(caught instanceof Error ? caught.message : "Unable to load gap findings.");
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [findingsKey, gapCount, initialGapsKey]);

  const visibleItems = expanded ? items : items.slice(0, limit);
  const hiddenCount = Math.max(count - limit, 0);
  const canToggle = count > limit;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Gaps found</p>
        <span className="text-sm font-medium tabular-nums">{count > 0 ? count : "—"}</span>
      </div>

      {isLoading && items.length === 0 ? (
        <p id={panelId} className="mt-2 text-xs text-muted-foreground">
          Loading gap details…
        </p>
      ) : null}
      {loadError ? (
        <p id={panelId} className="mt-2 text-xs text-destructive">
          {loadError}
        </p>
      ) : null}
      {!loadError && items.length > 0 ? (
        <>
          <GapFindingsList id={panelId} gaps={visibleItems} className="mt-2 max-w-3xl" />
          {canToggle ? (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show less" : `Show more (${hiddenCount} more)`}
            </button>
          ) : null}
        </>
      ) : null}
      {!isLoading && !loadError && count > 0 && items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Gap details are not available for this analysis yet.
        </p>
      ) : null}
      {!isLoading && !loadError && count === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No gap findings for this review yet.</p>
      ) : null}
    </div>
  );
}

function FindingImpactBadge({ impact }: { impact: string }) {
  const normalized = normalizeImpactScore(impact);
  const className =
    normalized === "HIGH"
      ? "border-destructive text-destructive"
      : normalized === "MEDIUM"
        ? "border-amber-500 text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", className)}>
      {normalized}
    </Badge>
  );
}
