"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, FilterX, Loader2, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  gapTriggerLabel,
  isMarketingContentTrigger,
  marketingRuleDisplayLabels,
} from "@/lib/gap-trigger";
import { TriggerBadge } from "@/components/shared/trigger-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ExpandableRegulation } from "@/components/dashboard/expandable-regulation";
import {
  tableCellClassName,
  tableFrameClassName,
  tableFrameRowClassName,
  tableFrameTableClassName,
  tableHeadClassName,
} from "@/lib/table-styles";
import { cn } from "@/lib/utils";

type TimePeriodDays = 7 | 30 | 90;

type ComplianceHistoryItem = {
  id: string;
  gap_analysis_id: string | null;
  policy_id: string | null;
  policy_name: string;
  regulatory_rules: string[];
  trigger_type: string | null;
  incident_at: string;
  cco_judgment_notes?: string | null;
};

type ComplianceHistoryResponse = {
  items: ComplianceHistoryItem[];
  total: number;
  days: number;
};

type ColumnFilters = {
  policy: string;
  regulation: string;
  incidentDate: string;
  trigger: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  policy: "",
  regulation: "",
  incidentDate: "",
  trigger: "",
};

type ComplianceHistoryTableProps = {
  authState: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  variant?: "compliance" | "marketing";
};

const COLLAPSED_ROW_LIMIT = 5;

export function ComplianceHistoryTable({
  authState,
  getAuthToken,
  orgId,
  variant = "compliance",
}: ComplianceHistoryTableProps) {
  const isMarketing = variant === "marketing";
  const [items, setItems] = useState<ComplianceHistoryItem[]>([]);
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [timePeriodDays, setTimePeriodDays] = useState<TimePeriodDays>(30);
  const [isOpen, setIsOpen] = useState(true);
  const [showAllRows, setShowAllRows] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredFilters = useDeferredValue(filters);
  const hasLoadedOnceRef = useRef(false);
  const previousPeriodRef = useRef(timePeriodDays);

  const loadHistory = useCallback(async (options?: { silent?: boolean }) => {
    if (authState !== "ready") {
      setIsLoading(false);
      return;
    }

    const periodChanged = previousPeriodRef.current !== timePeriodDays;
    previousPeriodRef.current = timePeriodDays;
    const silent =
      options?.silent ?? (hasLoadedOnceRef.current && !periodChanged);
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const triggerQuery = isMarketing
        ? "&trigger_type=marketing_content"
        : "";
      const result = await apiFetch<ComplianceHistoryResponse>(
        `/api/v1/compliance-history?days=${timePeriodDays}&limit=100${triggerQuery}`,
        undefined,
        { token, orgId }
      );
      setItems(
        isMarketing
          ? result.items.filter((item) => isMarketingContentTrigger(item.trigger_type))
          : result.items
      );
      setShowAllRows(false);
      hasLoadedOnceRef.current = true;
    } catch {
      if (!silent) {
        setItems([]);
        setError("Unable to load compliance history.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, isMarketing, orgId, timePeriodDays]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filteredItems = useMemo(() => {
    const normalized = Object.fromEntries(
      Object.entries(deferredFilters).map(([key, value]) => [
        key,
        value.trim().toLocaleLowerCase(),
      ])
    ) as Record<keyof ColumnFilters, string>;

    return items.filter((item) => {
      if (isMarketing && !isMarketingContentTrigger(item.trigger_type)) {
        return false;
      }
      const values: Record<keyof ColumnFilters, string> = {
        policy: item.policy_name,
        regulation: affectedRegulationLabels(item).join(" ") || "—",
        incidentDate: formatIncidentDate(item.incident_at),
        trigger: gapTriggerLabel(item.trigger_type),
      };
      return Object.entries(normalized).every(([key, query]) => {
        if (!query) return true;
        return values[key as keyof ColumnFilters]
          .toLocaleLowerCase()
          .includes(query);
      });
    });
  }, [deferredFilters, isMarketing, items]);

  const hasFilters = Object.values(filters).some((value) => value.trim());

  function updateFilter(key: keyof ColumnFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setShowAllRows(false);
  }

  const visibleItems =
    showAllRows || filteredItems.length <= COLLAPSED_ROW_LIMIT
      ? filteredItems
      : filteredItems.slice(0, COLLAPSED_ROW_LIMIT);
  const hiddenCount = Math.max(filteredItems.length - COLLAPSED_ROW_LIMIT, 0);

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <CardTitle className="text-base">
              {isMarketing ? "Marketing Review History" : "Compliance History"}
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isOpen ? "rotate-0" : "-rotate-90"
              )}
              aria-hidden
            />
            <Badge variant="outline" className="font-normal">
              {items.length}
            </Badge>
          </button>
          <CardDescription className="mt-1">
            {isMarketing
              ? `Marketing reviews · last ${timePeriodDays} days`
              : `Gap incidents by Internal Policy · last ${timePeriodDays} days`}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setShowAllRows(false);
              }}
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          ) : null}
          <div className="flex gap-1">
            {([7, 30, 90] as const).map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={timePeriodDays === days ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setTimePeriodDays(days)}
              >
                {days}d
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      {isOpen ? (
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading history
            </div>
          ) : null}
          {!isLoading && error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : null}
          {!isLoading && !error && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isMarketing
                ? "No marketing reviews were recorded in this period."
                : "No gap incidents were recorded in this period."}
            </p>
          ) : null}
          {!isLoading && !error && items.length > 0 ? (
            <div className="space-y-2">
              <div className={tableFrameClassName}>
                <table className={`w-full min-w-[760px] table-fixed text-sm ${tableFrameTableClassName}`}>
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[24%]" />
                    <col className="w-[40%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead className={tableHeadClassName}>
                    <tr>
                      <th className="!font-bold">Trigger</th>
                      <th className="!font-bold">
                        {isMarketing ? "Marketing Content" : "Internal Policy"}
                      </th>
                      <th className="!font-bold">Affected Regulation</th>
                      <th className="!font-bold">Incident Date</th>
                    </tr>
                    <tr className="border-t bg-background [&_th]:px-2 [&_th]:pb-2.5 [&_th]:pt-2">
                      <FilterCell
                        label="Trigger"
                        value={filters.trigger}
                        onChange={(value) => updateFilter("trigger", value)}
                      />
                      <FilterCell
                        label={isMarketing ? "Marketing Content" : "Internal Policy"}
                        value={filters.policy}
                        onChange={(value) => updateFilter("policy", value)}
                      />
                      <FilterCell
                        label="Affected Regulation"
                        value={filters.regulation}
                        onChange={(value) => updateFilter("regulation", value)}
                      />
                      <FilterCell
                        label="Incident Date"
                        value={filters.incidentDate}
                        onChange={(value) => updateFilter("incidentDate", value)}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id} className={tableFrameRowClassName}>
                        <td className={cn(tableCellClassName, "px-3 py-3")}>
                          <TriggerBadge triggerType={item.trigger_type} />
                        </td>
                        <td
                          className={cn(
                            tableCellClassName,
                            "px-3 py-3 font-medium"
                          )}
                        >
                          {item.policy_name}
                          {item.cco_judgment_notes ? (
                            <p
                              className="mt-1 text-xs font-normal text-muted-foreground"
                              title={item.cco_judgment_notes}
                            >
                              Prior CCO judgment: {item.cco_judgment_notes}
                            </p>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            tableCellClassName,
                            "px-3 py-3 text-muted-foreground"
                          )}
                        >
                          <AffectedRegulationCell item={item} />
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-3")}>
                          {formatIncidentDate(item.incident_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredItems.length === 0 ? (
                  <div className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
                    {isMarketing
                      ? "No marketing review history matches all selected filters."
                      : "No compliance history matches all selected filters."}
                  </div>
                ) : null}
              </div>
              {hiddenCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-primary hover:underline"
                  onClick={() => setShowAllRows((expanded) => !expanded)}
                >
                  {showAllRows ? "Show less" : `Show more (${hiddenCount} more)`}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-0.5">
            {isMarketing ? (
              <Button
                asChild
                variant="ghost"
                className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-primary hover:underline"
              >
                <Link href={{ pathname: "/compliance-gaps", hash: "marketing-gaps" }}>Open Marketing Gaps</Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-primary hover:underline"
                >
                  <Link href="/audit">Open Audit History</Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-primary hover:underline"
                >
                  <Link href="/compliance-gaps">Open Regulatory Compliance Gaps</Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function affectedRegulationLabels(item: ComplianceHistoryItem): string[] {
  if (isMarketingContentTrigger(item.trigger_type)) {
    return marketingRuleDisplayLabels(
      item.regulatory_rules,
      item.regulatory_rules.join("\n")
    );
  }
  return item.regulatory_rules
    .flatMap((value) => value.split(/\s*;\s*/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function AffectedRegulationCell({ item }: { item: ComplianceHistoryItem }) {
  return <ExpandableRegulation labels={affectedRegulationLabels(item)} />;
}

function FilterCell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <th>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Filter ${label.toLocaleLowerCase()}`}
          aria-label={`Filter by ${label}`}
          className="h-8 px-8 text-center text-xs font-normal normal-case tracking-normal"
        />
      </div>
    </th>
  );
}

function formatIncidentDate(value: string): string {
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  );
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
