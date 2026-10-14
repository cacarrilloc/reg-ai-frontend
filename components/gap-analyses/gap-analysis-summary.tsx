"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Download, FilePlus2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { downloadRevisionRedline, redlineDownloadFilename } from "@/lib/download-revision-redline";
import { cacheKey, cachedApiFetch, invalidateCache } from "@/lib/api-cache";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { useBackendAuth } from "@/lib/use-backend-auth";
import {
  formatAddedContentLabel,
  isInformationalImpact,
  normalizeImpactScore,
  sortAnalysesByImpact,
} from "@/lib/gap-analysis-text";
import {
  GapFindingsList,
  GapFindingsToggle,
  type GapFindingItem,
} from "@/components/gap-analyses/gap-findings-dropdown";
import { TriggerBadge } from "@/components/shared/trigger-badge";
import { isMarketingContentTrigger } from "@/lib/gap-trigger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  tableCellClassName,
  tableFrameClassName,
  tableFrameRowClassName,
  tableFrameTableClassName,
  tableHeadClassName,
} from "@/lib/table-styles";
import { cn } from "@/lib/utils";

type ImpactScore = "ALL" | "HIGH" | "MEDIUM";
type GapStatus = "ACTIVE" | "IN_REVIEW" | "UPLOAD_PENDING";

type GapAnalysis = {
  id: string;
  policy_id: string;
  policy_name: string;
  policy_version: number;
  impact_score: Exclude<ImpactScore, "ALL">;
  trigger_type: "publication" | "business_change" | "policy_update" | "marketing_content";
  trigger_id: string;
  trigger_label: string;
  gap_summary: string;
  gap_count?: number;
  gaps?: GapFindingItem[];
  created_at: string;
  status: GapStatus;
  revision_id?: string | null;
  redline_ready?: boolean;
  redline_eligible?: boolean;
  new_policy_from_business_change?: boolean;
  needs_review_decision?: boolean;
  needs_review_decision_message?: string | null;
  regulator_cosine_similarity?: number | null;
  business_change_cosine_similarity?: number | null;
};

function displayAddedContent(analysis: GapAnalysis): string | null {
  return formatAddedContentLabel(
    analysis.business_change_cosine_similarity ?? analysis.regulator_cosine_similarity,
  );
}

function needsRereviewPrompt(analysis: GapAnalysis): boolean {
  return Boolean(analysis.needs_review_decision);
}

function canRequestReview(analysis: GapAnalysis): boolean {
  if (analysis.trigger_type === "marketing_content") {
    return false;
  }
  if (analysis.new_policy_from_business_change) {
    return false;
  }
  if (needsRereviewPrompt(analysis)) {
    return true;
  }
  if (analysis.trigger_type === "business_change") {
    return analysis.redline_eligible !== false;
  }
  if (isInformationalImpact(analysis.impact_score)) {
    return false;
  }
  return true;
}

const actionButtonClassName =
  "h-auto min-h-8 w-fit max-w-full gap-1.5 whitespace-normal px-3 py-1.5 text-center leading-tight";

type PolicyRevisionResponse = {
  id: string;
  gap_analysis_id: string;
  redline_file_url: string | null;
  status: string;
};

function isReviewQueued(analysis: GapAnalysis): boolean {
  if (needsRereviewPrompt(analysis)) {
    return false;
  }
  return analysis.status === "IN_REVIEW" || analysis.status === "UPLOAD_PENDING";
}

type ActionMessageLink = {
  href: "/reviews";
  label: string;
};

type GapAnalysisSummaryProps = {
  compact?: boolean;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  orgId?: string | null;
};

export function GapAnalysisSummary({ compact = false }: { compact?: boolean }) {
  if (!isAuthConfigured()) {
    return <GapAnalysisSummaryContent compact={compact} orgId={getLocalDevOrgId()} />;
  }

  return <AuthedGapAnalysisSummary compact={compact} />;
}

function AuthedGapAnalysisSummary({ compact }: { compact: boolean }) {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <GapAnalysisSummaryContent
      compact={compact}
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
    />
  );
}

function GapAnalysisSummaryContent({
  compact,
  authState = "ready",
  getAuthToken,
  orgId
}: GapAnalysisSummaryProps & { compact: boolean }) {
  const { canDeleteResources } = useMemberCapabilities();
  const [analyses, setAnalyses] = useState<GapAnalysis[]>([]);
  const [impactScore, setImpactScore] = useState<ImpactScore>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [generatingGapId, setGeneratingGapId] = useState<string | null>(null);
  const [downloadingGapId, setDownloadingGapId] = useState<string | null>(null);
  const [deletingGapId, setDeletingGapId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<GapAnalysis | null>(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageLink, setMessageLink] = useState<ActionMessageLink | null>(null);
  const [expandedGapIds, setExpandedGapIds] = useState<Set<string>>(new Set());
  const [loadingFindingsIds, setLoadingFindingsIds] = useState<Set<string>>(new Set());
  const hasLoadedOnceRef = useRef(false);
  const focusedGapHandledRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const focusGapId = searchParams.get("gap_id")?.trim() || null;

  const loadFindingsForAnalysis = useCallback(
    async (analysisId: string) => {
      const existing = analyses.find((item) => item.id === analysisId);
      if ((existing?.gaps?.length ?? 0) > 0) {
        return;
      }
      setLoadingFindingsIds((current) => new Set(current).add(analysisId));
      try {
        const token = getAuthToken ? await getAuthToken() : null;
        if (getAuthToken && !token) {
          throw new Error("Sign in to view gap findings.");
        }
        const detail = await apiFetch<GapAnalysis>(
          `/api/v1/gap-analyses/${analysisId}`,
          undefined,
          { token, orgId }
        );
        startTransition(() => {
          setAnalyses((current) =>
            current.map((item) =>
              item.id === analysisId
                ? {
                    ...item,
                    gaps: detail.gaps ?? [],
                    gap_count: detail.gap_count ?? item.gap_count,
                    gap_summary: detail.gap_summary || item.gap_summary,
                  }
                : item
            )
          );
        });
      } catch {
        // Keep the row expandable; list still shows count.
      } finally {
        setLoadingFindingsIds((current) => {
          const next = new Set(current);
          next.delete(analysisId);
          return next;
        });
      }
    },
    [analyses, getAuthToken, orgId]
  );

  function toggleGapDetails(analysisId: string) {
    setExpandedGapIds((current) => {
      const next = new Set(current);
      if (next.has(analysisId)) {
        next.delete(analysisId);
      } else {
        next.add(analysisId);
        void loadFindingsForAnalysis(analysisId);
      }
      return next;
    });
  }

  useEffect(() => {
    if (!focusGapId || analyses.length === 0) {
      return;
    }
    if (focusedGapHandledRef.current === focusGapId) {
      return;
    }
    const match = analyses.find((item) => item.id === focusGapId);
    if (!match) {
      return;
    }
    focusedGapHandledRef.current = focusGapId;
    setExpandedGapIds((current) => new Set(current).add(focusGapId));
    void loadFindingsForAnalysis(focusGapId);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`gap-analysis-row-${focusGapId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [analyses, focusGapId, loadFindingsForAnalysis]);

  const loadAnalyses = useCallback(async (options?: { silent?: boolean; bypassCache?: boolean }) => {
    if (authState === "loading") {
      return;
    }
    if (authState === "signed-out") {
      setAnalyses([]);
      setError("Sign in to view policy gap analyses.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      setError(null);
    }
    const params = new URLSearchParams({
      limit: compact ? "6" : "50",
      include_findings: "false",
    });
    if (impactScore !== "ALL") {
      params.set("impact_score", impactScore);
    }
    const path = `/api/v1/gap-analyses?${params.toString()}`;

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to view policy gap analyses.");
      }
      const response = await cachedApiFetch(
        cacheKey(path, orgId),
        () => apiFetch<GapAnalysis[]>(path, undefined, { token, orgId }),
        { bypass: options?.bypassCache === true, ttlMs: 20_000 }
      );
      startTransition(() => {
        setAnalyses(
          sortAnalysesByImpact(
            response.filter((item) => !isMarketingContentTrigger(item.trigger_type)),
          ),
        );
      });
      hasLoadedOnceRef.current = true;
      if (!silent) {
        setError(null);
      }
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unable to load policy gap analyses.");
      }
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [authState, compact, getAuthToken, impactScore, orgId]);

  useEffect(() => {
    void loadAnalyses();
  }, [loadAnalyses]);

  useEffect(() => {
    if (authState !== "ready") {
      return;
    }
    const intervalId = window.setInterval(() => {
      void loadAnalyses({ silent: true, bypassCache: true });
    }, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadAnalyses({ silent: true, bypassCache: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authState, loadAnalyses]);

  async function reanalyzeStaleGaps() {
    setError(null);
    setMessage(null);
    setMessageLink(null);
    setIsReanalyzing(true);

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to re-run gap analysis.");
      }

      const response = await apiFetch<{ status: string; message: string }>(
        "/api/v1/gap-analyses/reanalyze-stale",
        { method: "POST" },
        { token, orgId, timeoutMs: 30_000 }
      );
      if (response.status === "skipped") {
        setError(response.message || "AI analysis did not run.");
        return;
      }
      setMessage(
        response.message ||
          "AI analysis started (scrape + gap review). Refresh in 1–3 minutes to see updated results."
      );
      // Soft refresh while the background workflow runs.
      window.setTimeout(() => {
        invalidateCache("/api/v1/gap-analyses");
        void loadAnalyses({ silent: true, bypassCache: true });
      }, 20_000);
      window.setTimeout(() => {
        invalidateCache("/api/v1/gap-analyses");
        void loadAnalyses({ silent: true, bypassCache: true });
      }, 70_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to re-run gap analysis.");
    } finally {
      setIsReanalyzing(false);
    }
  }

  async function requestReview(analysis: GapAnalysis) {
    setError(null);
    setMessage(null);
    setMessageLink(null);
    setGeneratingGapId(analysis.id);

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to request a policy review.");
      }

      const revision = await apiFetch<PolicyRevisionResponse>(
        `/api/v1/reviews/gap-analyses/${analysis.id}/redline`,
        { method: "POST" },
        { token, orgId }
      );
      invalidateCache("/api/v1/gap-analyses");
      invalidateCache("/api/v1/reviews/pending");
      if (revision.status.toUpperCase() === "PENDING") {
        setAnalyses((current) =>
          current.map((item) =>
            item.id === analysis.id
              ? {
                  ...item,
                  status: "IN_REVIEW",
                  revision_id: revision.id,
                  redline_ready: Boolean(revision.redline_file_url),
                  needs_review_decision: false,
                  needs_review_decision_message: null
                }
              : item
          )
        );
        setMessage(
          revision.redline_file_url
            ? `Review queued for ${analysis.policy_name}. Open the CCO Review Queue to approve or reject the redline.`
            : `Review queued for ${analysis.policy_name}. The redline is generating now. Refresh the CCO Review Queue in a minute.`
        );
        setMessageLink({ href: "/reviews", label: "Open CCO Review Queue" });
      } else {
        setMessage(`A prior review for ${analysis.policy_name} is already ${revision.status.toLowerCase()}.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request policy review.");
    } finally {
      setGeneratingGapId(null);
    }
  }

  function canDownloadRedline(analysis: GapAnalysis): boolean {
    return Boolean(analysis.revision_id) || canRequestReview(analysis);
  }

  async function downloadRedline(analysis: GapAnalysis) {
    setError(null);
    setMessage(null);
    setMessageLink(null);
    setDownloadingGapId(analysis.id);
    const filename = redlineDownloadFilename(analysis.policy_name);
    setMessage(
      analysis.redline_ready
        ? `Preparing redline for ${analysis.policy_name}.`
        : `Generating and downloading redline for ${analysis.policy_name}. This may take up to two minutes.`
    );
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to download a policy redline.");
      }

      let revisionId = (analysis.revision_id || "").trim();
      if (!revisionId) {
        const revision = await apiFetch<PolicyRevisionResponse>(
          `/api/v1/reviews/gap-analyses/${analysis.id}/redline`,
          { method: "POST" },
          { token, orgId }
        );
        revisionId = revision.id;
        invalidateCache("/api/v1/gap-analyses");
        invalidateCache("/api/v1/reviews/pending");
        setAnalyses((current) =>
          current.map((item) =>
            item.id === analysis.id
              ? {
                  ...item,
                  status: revision.status.toUpperCase() === "PENDING" ? "IN_REVIEW" : item.status,
                  revision_id: revision.id,
                  redline_ready: Boolean(revision.redline_file_url),
                  needs_review_decision: false,
                  needs_review_decision_message: null,
                }
              : item
          )
        );
      }

      await downloadRevisionRedline({
        revisionId,
        filename,
        token,
        orgId,
      });
      setAnalyses((current) =>
        current.map((item) =>
          item.id === analysis.id
            ? {
                ...item,
                revision_id: revisionId,
                redline_ready: true,
              }
            : item
        )
      );
      setMessage(`Downloaded redline for ${analysis.policy_name}. Review it before approving or rejecting.`);
      setMessageLink({ href: "/reviews", label: "Open CCO Review Queue" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download redline.");
    } finally {
      setDownloadingGapId(null);
    }
  }

  async function deleteGapAnalysis(analysis: GapAnalysis) {
    setError(null);
    setMessage(null);
    setMessageLink(null);
    setDeletingGapId(analysis.id);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to delete a gap analysis.");
      }
      await apiFetch<void>(
        `/api/v1/gap-analyses/${analysis.id}`,
        { method: "DELETE" },
        { token, orgId }
      );
      invalidateCache("/api/v1/gap-analyses");
      invalidateCache("/api/v1/reviews/pending");
      setAnalyses((current) => current.filter((item) => item.id !== analysis.id));
      setExpandedGapIds((current) => {
        const next = new Set(current);
        next.delete(analysis.id);
        return next;
      });
      setMessage(`Deleted gap analysis for ${analysis.policy_name}.`);
      setDeleteConfirm(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete gap analysis.");
    } finally {
      setDeletingGapId(null);
    }
  }

  return (
    <Card>
      {deleteConfirm ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="gap-delete-confirm-title"
          aria-describedby="gap-delete-confirm-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border-2 border-destructive bg-background p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-3">
                <h2 id="gap-delete-confirm-title" className="text-lg font-semibold">
                  Delete gap analysis?
                </h2>
                <p id="gap-delete-confirm-description" className="text-sm text-muted-foreground">
                  This permanently removes the gap for{" "}
                  <strong>{deleteConfirm.policy_name}</strong> from Internal Policy Gaps.
                  Any linked CCO Review Queue item for this gap is also removed. This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => void deleteGapAnalysis(deleteConfirm)}
                    disabled={deletingGapId === deleteConfirm.id}
                  >
                    {deletingGapId === deleteConfirm.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Yes, delete gap"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deletingGapId === deleteConfirm.id}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <CardTitle>Internal Policy Gaps</CardTitle>
          <CardDescription>
            Internal policies with regulation or business-change gaps. Request Review queues a
            tracked redline. Download the redline from this table before approving or rejecting it
            in the CCO Review Queue. Marketing reviews are in Marketing Gaps below.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="gap-impact-filter">Impact score</label>
          <select
            id="gap-impact-filter"
            value={impactScore}
            onChange={(event) => setImpactScore(event.target.value as ImpactScore)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="ALL">All impact</option>
            <option value="HIGH">High impact</option>
            <option value="MEDIUM">Medium impact</option>
          </select>
          <Button
            variant="default"
            size="sm"
            className="gap-2"
            onClick={() => void reanalyzeStaleGaps()}
            disabled={isLoading || isReanalyzing || authState !== "ready"}
          >
            {isReanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Re-run AI analysis
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAnalyses({ bypassCache: true })}
            disabled={isLoading || isRefreshing || authState !== "ready"}
            aria-label="Refresh policy gap analyses"
          >
            {isLoading || isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {message ? (
          <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-400">
            {message}{" "}
            {messageLink ? (
              <Link href={messageLink.href} className="font-medium underline underline-offset-2">
                {messageLink.label}
              </Link>
            ) : null}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!error && isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading gap analyses
          </div>
        ) : null}
        {!error && !isLoading && analyses.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            No Internal policies currently need review for regulation gaps.
          </p>
        ) : null}
        {!error && !isLoading && analyses.length > 0 ? (
          <div className={tableFrameClassName}>
            <table className={`w-full table-fixed text-center text-sm ${tableFrameTableClassName}`}>
              <colgroup>
                {canDeleteResources ? <col className="w-[8%]" /> : null}
                <col className={canDeleteResources ? "w-[14%]" : "w-[16%]"} />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className={canDeleteResources ? "w-[24%]" : "w-[30%]"} />
              </colgroup>
              <thead className={tableHeadClassName}>
                <tr>
                  {canDeleteResources ? (
                    <th>
                      <span className="sr-only">Delete</span>
                    </th>
                  ) : null}
                  <th>Internal Policy</th>
                  <th>Gaps</th>
                  <th>Impact</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((analysis) => {
                  const gaps = analysis.gaps ?? [];
                  const gapCount = Math.max(analysis.gap_count ?? 0, gaps.length);
                  const expanded = expandedGapIds.has(analysis.id);
                  const panelId = `gap-findings-${analysis.id}`;
                  const addedContentLabel = displayAddedContent(analysis);
                  const isBusy =
                    generatingGapId === analysis.id
                    || downloadingGapId === analysis.id
                    || deletingGapId === analysis.id;
                  return (
                    <Fragment key={analysis.id}>
                      <tr
                        id={`gap-analysis-row-${analysis.id}`}
                        className={cn(
                          tableFrameRowClassName,
                          analysis.id === focusGapId && "bg-muted/40"
                        )}
                      >
                        {canDeleteResources ? (
                        <td className={`px-3 py-4 ${tableCellClassName}`}>
                          <div className="flex justify-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 border-foreground text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteConfirm(analysis)}
                              disabled={authState !== "ready" || isBusy}
                              aria-label={`Delete gap analysis for ${analysis.policy_name}`}
                            >
                              {deletingGapId === analysis.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </td>
                        ) : null}
                        <td className={`px-3 py-4 text-center font-medium ${tableCellClassName}`}>
                          <div className="break-words">{analysis.policy_name}</div>
                          <div className="mt-1 text-xs font-normal text-muted-foreground">
                            Version {analysis.policy_version}
                          </div>
                          {addedContentLabel ? (
                            <div className="mt-1 font-mono text-xs font-normal text-muted-foreground">
                              {addedContentLabel}
                            </div>
                          ) : null}
                        </td>
                        <td className={`px-3 py-4 ${tableCellClassName}`}>
                          <div className="flex justify-center">
                            <GapFindingsToggle
                              count={gapCount}
                              open={expanded}
                              onToggle={() => toggleGapDetails(analysis.id)}
                              panelId={panelId}
                            />
                          </div>
                        </td>
                        <td className={`px-3 py-4 ${tableCellClassName}`}>
                          <div className="flex justify-center">
                            <ImpactBadge impact={analysis.impact_score} />
                          </div>
                        </td>
                        <td className={`px-3 py-4 ${tableCellClassName}`}>
                          <div className="flex flex-col items-center justify-center gap-1">
                            <TriggerBadge triggerType={analysis.trigger_type} />
                            {needsRereviewPrompt(analysis) ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500 text-amber-700 dark:text-amber-400"
                              >
                                Re-review
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className={`px-3 py-4 ${tableCellClassName}`}>
                          <div className="flex justify-center">
                            <StatusBadge status={analysis.status} />
                          </div>
                        </td>
                        <td className={`whitespace-nowrap px-3 py-4 text-muted-foreground ${tableCellClassName}`}>
                          <CreatedAtCell value={analysis.created_at} />
                        </td>
                        <td className={`px-3 py-4 ${tableCellClassName}`}>
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className={actionButtonClassName}
                                onClick={() => void requestReview(analysis)}
                                disabled={
                                  authState !== "ready"
                                  || isBusy
                                  || !canRequestReview(analysis)
                                  || isReviewQueued(analysis)
                                }
                              >
                                {generatingGapId === analysis.id ? (
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                ) : isReviewQueued(analysis) ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                ) : (
                                  <FilePlus2 className="h-4 w-4 shrink-0" />
                                )}
                                <span>
                                  {!canRequestReview(analysis)
                                    ? analysis.new_policy_from_business_change
                                      ? "New policy"
                                      : "No review"
                                    : isReviewQueued(analysis)
                                      ? analysis.status === "UPLOAD_PENDING"
                                        ? "Upload pending"
                                        : "In review"
                                      : needsRereviewPrompt(analysis)
                                        ? "Request review again"
                                        : "Request review"}
                                </span>
                              </Button>
                              {canDownloadRedline(analysis) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={actionButtonClassName}
                                  onClick={() => void downloadRedline(analysis)}
                                  disabled={authState !== "ready" || isBusy}
                                >
                                  {downloadingGapId === analysis.id ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4 shrink-0" />
                                  )}
                                  <span>
                                    {downloadingGapId === analysis.id
                                      ? "Preparing redline..."
                                      : analysis.redline_ready || analysis.revision_id
                                        ? "Download redline"
                                        : "Generate & download redline"}
                                  </span>
                                </Button>
                              ) : null}
                            </div>
                            {needsRereviewPrompt(analysis) ? (
                              <p className="w-full text-justify text-xs font-normal leading-snug text-amber-700 dark:text-amber-400">
                                {analysis.needs_review_decision_message
                                  ?? "A new gap analysis has been generated. Request Review again to send this gap to the CCO Review Queue with a new Redline doc."}
                              </p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className={cn(tableFrameRowClassName, "bg-muted/30")}>
                          <td colSpan={canDeleteResources ? 8 : 7} className="px-4 py-3 text-left">
                            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                              {`Gap summaries for ${analysis.policy_name}`}
                            </p>
                            {loadingFindingsIds.has(analysis.id) && gaps.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Loading gap details…</p>
                            ) : (
                              <GapFindingsList id={panelId} gaps={gaps} />
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const normalized = normalizeImpactScore(impact);
  const className = normalized === "HIGH"
    ? "border-destructive text-destructive"
    : normalized === "MEDIUM"
      ? "border-amber-500 text-amber-700 dark:text-amber-400"
      : "text-muted-foreground";
  return <Badge variant="outline" className={className}>{normalized}</Badge>;
}

function StatusBadge({ status }: { status: GapStatus }) {
  const filled = status === "ACTIVE";
  return (
    <Badge
      variant="outline"
      className={filled ? "border-transparent bg-foreground text-background" : undefined}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

function CreatedAtCell({ value }: { value: string }) {
  const { date, time } = formatGapDateParts(value);
  if (!date) {
    return <span>Unknown date</span>;
  }
  return (
    <div className="flex flex-col items-center">
      <div>{date}</div>
      {time ? <div className="mt-1 text-xs">{time}</div> : null}
    </div>
  );
}

function formatGapDateParts(value: string): { date: string; time: string } {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: "", time: "" };
  }
  return {
    date: new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(parsed),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }).format(parsed)
  };
}
