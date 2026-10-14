"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Download,
  FilePlus2,
  FilterX,
  History,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  analysisDownloadButtonLabel,
  canDownloadAnalysis,
  canRetryAnalysis,
  formatAnalysisStatus,
  isAnalysisInProgress,
} from "@/lib/business-change-analysis";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventSummaryMarkdown } from "@/components/business-changes/event-summary-markdown";
import { Input } from "@/components/ui/input";
import { invalidateCache } from "@/lib/api-cache";
import {
  tableCellClassName,
  tableFrameClassName,
  tableFrameRowClassName,
  tableFrameTableClassName,
  tableHeadClassName,
} from "@/lib/table-styles";
import { cn } from "@/lib/utils";

type BusinessChangeItem = {
  id: string;
  change_type: string;
  description: string;
  change_date: string | null;
  triggers_review: boolean;
  assessment_rationale: string;
  event_summary: string;
  assessment_mode: string;
  flagged_at: string | null;
  analysis_status: string;
  analysis_generated_at: string | null;
  gap_analysis_id?: string | null;
  gap_status?: string | null;
  gap_redline_eligible?: boolean;
};

type ColumnFilters = {
  type: string;
  description: string;
  status: string;
  date: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  type: "",
  description: "",
  status: "",
  date: "",
};

const COLLAPSED_ROW_LIMIT = 5;

export function BusinessChangeHistory() {
  if (!isAuthConfigured()) {
    return <BusinessChangeHistoryContent orgId={getLocalDevOrgId()} />;
  }
  return <AuthedBusinessChangeHistory />;
}

function AuthedBusinessChangeHistory() {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <BusinessChangeHistoryContent
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
    />
  );
}

function BusinessChangeHistoryContent({
  authState = "ready",
  getAuthToken,
  orgId
}: {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
}) {
  const { canDeleteResources } = useMemberCapabilities();
  const [changes, setChanges] = useState<BusinessChangeItem[]>([]);
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [isOpen, setIsOpen] = useState(true);
  const [showAllRows, setShowAllRows] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [requestingReviewId, setRequestingReviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BusinessChangeItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deferredFilters = useDeferredValue(filters);
  const hasLoadedOnceRef = useRef(false);

  const loadChanges = useCallback(async (options?: { silent?: boolean }) => {
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
      const response = await apiFetch<BusinessChangeItem[]>(
        "/api/v1/business-changes?limit=100",
        undefined,
        { token, orgId }
      );
      setChanges((current) => {
        const finishedPending = current.some((item) => {
          const updated = response.find((row) => row.id === item.id);
          return Boolean(
            updated
            && isAnalysisInProgress(item.analysis_status)
            && !isAnalysisInProgress(updated.analysis_status)
          );
        });
        if (finishedPending) {
          invalidateCache("/api/v1/gap-analyses");
        }
        return response;
      });
      hasLoadedOnceRef.current = true;
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unable to load business changes.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  const hasPendingAnalysis = changes.some((change) => isAnalysisInProgress(change.analysis_status));

  useEffect(() => {
    if (!hasPendingAnalysis || authState !== "ready") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadChanges({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [authState, hasPendingAnalysis, loadChanges]);

  const filteredChanges = useMemo(() => {
    const normalized = Object.fromEntries(
      Object.entries(deferredFilters).map(([key, value]) => [
        key,
        value.trim().toLocaleLowerCase(),
      ])
    ) as Record<keyof ColumnFilters, string>;

    return changes.filter((change) => {
      const values: Record<keyof ColumnFilters, string> = {
        type: formatChangeType(change.change_type),
        description: [change.description, change.event_summary, change.assessment_rationale]
          .filter(Boolean)
          .join(" "),
        status: statusFilterText(change),
        date: formatDate(change.flagged_at || change.change_date),
      };
      return Object.entries(normalized).every(([key, query]) => {
        if (!query) return true;
        return values[key as keyof ColumnFilters]
          .toLocaleLowerCase()
          .includes(query);
      });
    });
  }, [changes, deferredFilters]);

  const hasFilters = Object.values(filters).some((value) => value.trim());
  const visibleChanges =
    showAllRows || filteredChanges.length <= COLLAPSED_ROW_LIMIT
      ? filteredChanges
      : filteredChanges.slice(0, COLLAPSED_ROW_LIMIT);
  const hiddenCount = Math.max(filteredChanges.length - COLLAPSED_ROW_LIMIT, 0);

  function updateFilter(key: keyof ColumnFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setShowAllRows(false);
  }

  async function retryAnalysisGeneration(changeId: string) {
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        `/api/v1/business-changes/${changeId}/generate-analysis`,
        { method: "POST" },
        { token, orgId }
      );
      invalidateCache("/api/v1/gap-analyses");
      await loadChanges();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to retry analysis generation.");
    }
  }

  async function deleteChange(change: BusinessChangeItem) {
    setError(null);
    setDeletingId(change.id);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to delete a business change.");
      }
      await apiFetch<void>(
        `/api/v1/business-changes/${change.id}`,
        { method: "DELETE" },
        { token, orgId }
      );
      invalidateCache("/api/v1/gap-analyses");
      setChanges((current) => current.filter((item) => item.id !== change.id));
      setDeleteConfirm(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete business change.");
    } finally {
      setDeletingId(null);
    }
  }

  async function requestReview(change: BusinessChangeItem) {
    if (!change.gap_analysis_id) {
      setError("This business change does not have an Internal Policy gap yet. Retry generation first.");
      return;
    }
    setError(null);
    setRequestingReviewId(change.id);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        `/api/v1/reviews/gap-analyses/${change.gap_analysis_id}/redline`,
        { method: "POST" },
        { token, orgId }
      );
      invalidateCache("/api/v1/gap-analyses");
      invalidateCache("/api/v1/reviews/pending");
      setChanges((current) =>
        current.map((item) =>
          item.id === change.id ? { ...item, gap_status: "IN_REVIEW" } : item
        )
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request review.");
    } finally {
      setRequestingReviewId(null);
    }
  }

  async function downloadAnalysis(changeId: string) {
    setDownloadingId(changeId);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await apiFetch<{ download_url: string }>(
        `/api/v1/business-changes/${changeId}/analysis`,
        undefined,
        { token, orgId }
      );
      window.open(response.download_url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download regulatory analysis.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Card>
      {deleteConfirm ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="business-change-delete-confirm-title"
          aria-describedby="business-change-delete-confirm-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border-2 border-destructive bg-background p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-3">
                <h2 id="business-change-delete-confirm-title" className="text-lg font-semibold">
                  Delete business change?
                </h2>
                <p id="business-change-delete-confirm-description" className="text-sm text-muted-foreground">
                  This permanently removes{" "}
                  <strong>{formatChangeType(deleteConfirm.change_type)}</strong> from Business
                  Change History. Any linked Internal Policy Gaps row for this change is also
                  removed. This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => void deleteChange(deleteConfirm)}
                    disabled={deletingId === deleteConfirm.id}
                  >
                    {deletingId === deleteConfirm.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Yes, delete change"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deletingId === deleteConfirm.id}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <History className="h-5 w-5 shrink-0" aria-hidden />
            <CardTitle>Business Change History</CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isOpen ? "rotate-0" : "-rotate-90"
              )}
              aria-hidden
            />
            <Badge variant="outline" className="font-normal">
              {changes.length}
            </Badge>
          </button>
          <CardDescription className="mt-1">
            Recent business changes with AI summaries and regulatory analysis documents.
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
          <Button variant="outline" size="sm" onClick={() => void loadChanges()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {isOpen ? (
        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!error && isLoading ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading history
            </div>
          ) : null}
          {!error && !isLoading && changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No business changes logged yet.</p>
          ) : null}
          {!error && !isLoading && changes.length > 0 ? (
            <div className="space-y-2">
              <div className={tableFrameClassName}>
                <table className={`w-full min-w-[860px] table-fixed text-sm ${tableFrameTableClassName}`}>
                  <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[38%]" />
                    <col className="w-[16%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                  </colgroup>
                  <thead className={tableHeadClassName}>
                    <tr>
                      <th className="!font-bold">Type</th>
                      <th className="!font-bold">Description</th>
                      <th className="!font-bold">Status</th>
                      <th className="!font-bold">Date</th>
                      <th className="!font-bold">Actions</th>
                    </tr>
                    <tr className="border-t bg-background [&_th]:px-2 [&_th]:pb-2.5 [&_th]:pt-2">
                      <FilterCell
                        label="Type"
                        value={filters.type}
                        onChange={(value) => updateFilter("type", value)}
                      />
                      <FilterCell
                        label="Description"
                        value={filters.description}
                        onChange={(value) => updateFilter("description", value)}
                      />
                      <FilterCell
                        label="Status"
                        value={filters.status}
                        onChange={(value) => updateFilter("status", value)}
                      />
                      <FilterCell
                        label="Date"
                        value={filters.date}
                        onChange={(value) => updateFilter("date", value)}
                      />
                      <th aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleChanges.map((change) => (
                      <tr key={change.id} className={tableFrameRowClassName}>
                        <td className={cn(tableCellClassName, "px-3 py-3")}>
                          <Badge variant="outline">{formatChangeType(change.change_type)}</Badge>
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-3 text-left")}>
                          <p className="font-medium">{change.description}</p>
                          <ExpandableEventSummary
                            text={change.event_summary || change.assessment_rationale}
                          />
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-3")}>
                          <div className="flex flex-col items-center gap-1">
                            <Badge
                              variant="outline"
                              className={
                                change.triggers_review
                                  ? "border-transparent bg-foreground text-background"
                                  : undefined
                              }
                            >
                              {change.triggers_review ? "Review flagged" : "No review"}
                            </Badge>
                            <Badge variant="outline">
                              {formatAnalysisStatus(change.analysis_status)}
                            </Badge>
                          </div>
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-3")}>
                          {formatDate(change.flagged_at || change.change_date)}
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-3")}>
                          <div className="flex flex-col items-center gap-2">
                            {canDeleteResources ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 border-foreground text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteConfirm(change)}
                              disabled={authState !== "ready" || deletingId === change.id}
                              aria-label={`Delete business change ${formatChangeType(change.change_type)}`}
                            >
                              {deletingId === change.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full gap-2"
                              onClick={() => void downloadAnalysis(change.id)}
                              disabled={
                                !canDownloadAnalysis(change.analysis_status)
                                || downloadingId === change.id
                              }
                            >
                              {downloadingId === change.id || isAnalysisInProgress(change.analysis_status) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              {analysisDownloadButtonLabel(
                                change.analysis_status,
                                downloadingId === change.id
                              )}
                            </Button>
                            {canRetryAnalysis(change.analysis_status, change.gap_analysis_id) ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => void retryAnalysisGeneration(change.id)}
                              >
                                Retry generation
                              </Button>
                            ) : null}
                            {change.gap_analysis_id && change.gap_redline_eligible ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full gap-2"
                                onClick={() => void requestReview(change)}
                                disabled={
                                  authState !== "ready"
                                  || requestingReviewId === change.id
                                  || change.gap_status === "IN_REVIEW"
                                  || change.gap_status === "UPLOAD_PENDING"
                                }
                              >
                                {requestingReviewId === change.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <FilePlus2 className="h-4 w-4" />
                                )}
                                {change.gap_status === "UPLOAD_PENDING"
                                  ? "Upload pending"
                                  : change.gap_status === "IN_REVIEW"
                                    ? "In review"
                                    : "Request review"}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredChanges.length === 0 ? (
                  <div className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
                    No business change history matches all selected filters.
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
        </CardContent>
      ) : null}
    </Card>
  );
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

function ExpandableEventSummary({ text }: { text: string }) {
  const valueRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const trimmed = text.trim();

  useEffect(() => {
    setExpanded(false);
  }, [trimmed]);

  useEffect(() => {
    if (expanded || !valueRef.current || !trimmed) return;

    const element = valueRef.current;
    const measure = () => {
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, trimmed]);

  if (!trimmed) {
    return null;
  }

  return (
    <div className="mt-2 text-left font-normal text-muted-foreground">
      <div
        ref={valueRef}
        className={expanded ? "min-w-0" : "line-clamp-3 min-w-0"}
      >
        <EventSummaryMarkdown text={trimmed} />
      </div>
      {overflows || expanded ? (
        <button
          type="button"
          className="mt-1 block w-full text-center text-xs font-medium text-primary hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function formatChangeType(value: string): string {
  return value.replace(/_/g, " ");
}

function statusFilterText(change: BusinessChangeItem): string {
  return [
    change.triggers_review ? "Review flagged" : "No review",
    formatAnalysisStatus(change.analysis_status),
    change.gap_status || "",
  ].join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
