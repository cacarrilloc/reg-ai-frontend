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
import {
  ArrowUpRight,
  ClipboardCheck,
  FilterX,
  Loader2,
  Search,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cacheKey, cachedApiFetch } from "@/lib/api-cache";
import { gapTriggerLabel, isMarketingContentTrigger, marketingRuleDisplayLabels } from "@/lib/gap-trigger";
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

type PendingApproval = {
  revision_id: string;
  policy_name: string;
  impact_score: string;
  trigger_type: "publication" | "business_change" | "policy_update" | string;
  regulatory_publication: string | null;
  marketing_rule_labels?: string[];
  business_change: string | null;
  change_date: string;
};

type ReviewDashboardResponse = {
  pending_revisions: PendingApproval[];
  total_pending: number;
};

type ColumnFilters = {
  trigger: string;
  policy: string;
  publication: string;
  businessChange: string;
  severity: string;
  changeDate: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  trigger: "",
  policy: "",
  publication: "",
  businessChange: "",
  severity: "",
  changeDate: "",
};

function regulationDisplayLabels(approval: PendingApproval): string[] {
  if (isMarketingContentTrigger(approval.trigger_type)) {
    return marketingRuleDisplayLabels(
      approval.marketing_rule_labels,
      approval.regulatory_publication ?? ""
    );
  }
  return [];
}

type PendingApprovalsTableProps = {
  authState: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
};

export function PendingApprovalsTable({
  authState,
  getAuthToken,
  orgId,
}: PendingApprovalsTableProps) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredFilters = useDeferredValue(filters);
  const hasLoadedOnceRef = useRef(false);

  const loadApprovals = useCallback(async (options?: { silent?: boolean }) => {
    if (authState !== "ready") {
      setIsLoading(false);
      return;
    }
    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const path = "/api/v1/reviews/pending?include_findings=false";
      const response = await cachedApiFetch(
        cacheKey(path, orgId),
        () =>
          apiFetch<ReviewDashboardResponse>(path, undefined, {
            token,
            orgId,
          }),
        { ttlMs: 15_000 }
      );
      setApprovals(response.pending_revisions);
      hasLoadedOnceRef.current = true;
    } catch (caught) {
      if (!silent) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load reviews pending approval."
        );
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);
  const filteredApprovals = useMemo(() => {
    const normalized = Object.fromEntries(
      Object.entries(deferredFilters).map(([key, value]) => [
        key,
        value.trim().toLocaleLowerCase(),
      ])
    ) as Record<keyof ColumnFilters, string>;

    return approvals.filter((approval) => {
      const affectedRules = regulationDisplayLabels(approval);
      const values: Record<keyof ColumnFilters, string> = {
        trigger: gapTriggerLabel(approval.trigger_type),
        policy: approval.policy_name,
        publication:
          affectedRules.join(" ") ||
          approval.regulatory_publication ||
          "— N/A Not applicable",
        businessChange: approval.business_change ?? "— N/A Not applicable",
        severity: approval.impact_score,
        changeDate: formatTableDate(approval.change_date),
      };
      return Object.entries(normalized).every(([key, query]) => {
        if (!query) return true;
        return values[key as keyof ColumnFilters]
          .toLocaleLowerCase()
          .includes(query);
      });
    });
  }, [approvals, deferredFilters]);

  const hasFilters = Object.values(filters).some((value) => value.trim());

  function updateFilter(key: keyof ColumnFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Reviews Pending Approval</CardTitle>
            <Badge variant="outline" className="bg-background">
              {approvals.length}
            </Badge>
          </div>
          <CardDescription className="mt-1">
            Filter any column to quickly isolate the review that needs attention.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Link href="/reviews">
              CCO Review Queue
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading pending reviews
          </div>
        ) : error ? (
          <div className="py-8 text-sm text-destructive">{error}</div>
        ) : approvals.length === 0 ? (
          <div className="py-10 text-center">
            <Checkmark />
            <p className="mt-3 text-sm font-medium">No reviews are waiting for approval.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New review requests will appear here automatically.
            </p>
          </div>
        ) : (
          <div className={tableFrameClassName}>
            <table className={`min-w-[1050px] w-full table-fixed text-sm ${tableFrameTableClassName}`}>
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[20%]" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className={tableHeadClassName}>
                <tr>
                  <th className="!font-bold">Trigger</th>
                  <th className="!font-bold">Policy</th>
                  <th className="!font-bold">Regulation</th>
                  <th className="!font-bold">Business Change</th>
                  <th className="!font-bold">Severity</th>
                  <th className="!font-bold">Date of Change</th>
                </tr>
                <tr className="border-t bg-background [&_th]:px-2 [&_th]:pb-2.5 [&_th]:pt-2">
                  <FilterCell
                    label="Trigger"
                    value={filters.trigger}
                    onChange={(value) => updateFilter("trigger", value)}
                  />
                  <FilterCell
                    label="Policy"
                    value={filters.policy}
                    onChange={(value) => updateFilter("policy", value)}
                  />
                  <FilterCell
                    label="Reg publication"
                    value={filters.publication}
                    onChange={(value) => updateFilter("publication", value)}
                  />
                  <FilterCell
                    label="Business change"
                    value={filters.businessChange}
                    onChange={(value) => updateFilter("businessChange", value)}
                  />
                  <FilterCell
                    label="Severity"
                    value={filters.severity}
                    onChange={(value) => updateFilter("severity", value)}
                  />
                  <FilterCell
                    label="Date of change"
                    value={filters.changeDate}
                    onChange={(value) => updateFilter("changeDate", value)}
                  />
                </tr>
              </thead>
              <tbody>
                {filteredApprovals.map((approval) => (
                  <tr
                    key={approval.revision_id}
                    className={`${tableFrameRowClassName} hover:bg-muted/30`}
                  >
                    <td className={`px-3 py-3.5 ${tableCellClassName}`}>
                      <TriggerBadge triggerType={approval.trigger_type} />
                    </td>
                    <td className={`px-3 py-3.5 font-medium ${tableCellClassName}`}>
                      <Link
                        href={`/reviews?revision_id=${encodeURIComponent(approval.revision_id)}`}
                        className="line-clamp-2 hover:text-primary hover:underline"
                      >
                        {approval.policy_name}
                      </Link>
                    </td>
                    <td className={`px-3 py-3.5 text-muted-foreground ${tableCellClassName}`}>
                      <RegulationCell approval={approval} />
                    </td>
                    <td className={`px-3 py-3.5 text-muted-foreground ${tableCellClassName}`}>
                      <CellValue
                        value={approval.business_change}
                        emptyLabel="N/A"
                      />
                    </td>
                    <td className={`px-3 py-3.5 ${tableCellClassName}`}>
                      <SeverityBadge severity={approval.impact_score} />
                    </td>
                    <td className={`px-3 py-3.5 text-muted-foreground ${tableCellClassName}`}>
                      {formatTableDate(approval.change_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredApprovals.length === 0 ? (
              <div className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
                No pending reviews match all selected filters.
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RegulationCell({ approval }: { approval: PendingApproval }) {
  return <ExpandableRegulation labels={regulationCellLabels(approval)} />;
}

function regulationCellLabels(approval: PendingApproval): string[] {
  const marketingLabels = regulationDisplayLabels(approval);
  if (marketingLabels.length > 0) {
    return marketingLabels;
  }
  return (approval.regulatory_publication ?? "")
    .split(/\s*;\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
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

function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity.toUpperCase();
  const className =
    normalized === "HIGH"
      ? "border-destructive text-destructive"
      : normalized === "MEDIUM"
        ? "border-amber-500 text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";
  return (
    <Badge variant="outline" className={className}>
      {normalized}
    </Badge>
  );
}

function CellValue({
  value,
  expandable = false,
  emptyLabel = "—",
}: {
  value: string | null;
  expandable?: boolean;
  emptyLabel?: string;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  useEffect(() => {
    if (!expandable || expanded || !valueRef.current) return;

    const element = valueRef.current;
    const measure = () => {
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expandable, expanded, value]);

  if (!value?.trim()) {
    return <span aria-label="Not applicable">{emptyLabel}</span>;
  }

  return (
    <div>
      <span
        ref={valueRef}
        className={expandable && !expanded ? "line-clamp-2" : undefined}
      >
        {value}
      </span>
      {expandable && (overflows || expanded) ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function Checkmark() {
  return (
    <div
      className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"
      aria-hidden
    >
      <ClipboardCheck className="h-4 w-4" />
    </div>
  );
}

function formatTableDate(value: string): string {
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  );
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
