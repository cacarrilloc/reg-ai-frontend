"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingReviewPanel } from "@/components/marketing/marketing-review-panel";
import { marketingFormatLabel } from "@/lib/gap-trigger";
import { formatAddedContentLabel } from "@/lib/gap-analysis-text";
import { useMemberCapabilities } from "@/lib/member-capabilities";

type MarketingContentItem = {
  id: string;
  name: string;
  storage_path?: string | null;
  status: string;
  uploaded_by?: string | null;
  created_at: string;
  format?: string;
  content_tags?: string[];
  latest_review_status?: string | null;
  cco_review_in_progress?: boolean;
  cosine_similarity?: number | null;
};

function isCcoReviewInProgress(item: MarketingContentItem): boolean {
  const review = (item.latest_review_status || "").trim().toLowerCase();
  const content = (item.status || "").trim().toLowerCase();
  return Boolean(item.cco_review_in_progress) || review === "signed_off" || content === "reviewed";
}

type MarketingListResponse = {
  items: MarketingContentItem[];
  total: number;
};

export type MarketingContentListProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  refreshKey?: number;
};

function contentTypeLabel(format?: string): string {
  return marketingFormatLabel(format) || (format || "").replace(/_/g, " ").trim();
}

function reviewStatusLabel(item: MarketingContentItem): string {
  if (isCcoReviewInProgress(item)) {
    return "CCO review in progress";
  }
  const review = (item.latest_review_status || "").trim().toLowerCase();
  const content = (item.status || "").trim().toLowerCase();
  return (review || content).replace(/_/g, " ");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function MarketingContentList({
  authState = "ready",
  getAuthToken,
  orgId,
  refreshKey
}: MarketingContentListProps) {
  const { canDeleteResources } = useMemberCapabilities();
  const [items, setItems] = useState<MarketingContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MarketingContentItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const focusContentId = searchParams.get("content_id")?.trim() || null;
  const focusedContentHandledRef = useRef<string | null>(null);

  const loadItems = useCallback(async (options?: { silent?: boolean }) => {
    if (authState !== "ready") {
      setIsLoading(false);
      return;
    }
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await apiFetch<MarketingListResponse>(
        "/api/v1/marketing/contents",
        undefined,
        { token, orgId }
      );
      setItems((current) => {
        const optimistic = new Map(
          current.filter((row) => isCcoReviewInProgress(row)).map((row) => [row.id, row])
        );
        return (response.items ?? [])
          .filter((item) => {
            const status = (item.status || "").trim().toLowerCase();
            return status !== "approved" && status !== "rejected";
          })
          .map((item) => {
            if (isCcoReviewInProgress(item)) {
              return item;
            }
            const prior = optimistic.get(item.id);
            if (!prior) {
              return item;
            }
            return {
              ...item,
              status: prior.status,
              latest_review_status: prior.latest_review_status,
              cco_review_in_progress: true,
            };
          });
      });
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unable to load marketing content.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, orgId]);

  async function deleteItem(item: MarketingContentItem) {
    setError(null);
    setDeletingId(item.id);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        `/api/v1/marketing/contents/${item.id}`,
        { method: "DELETE" },
        { token, orgId }
      );
      setItems((current) => current.filter((row) => row.id !== item.id));
      setExpandedId((current) => (current === item.id ? null : current));
      setDeleteConfirm(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete this review.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshKey]);

  useEffect(() => {
    if (!focusContentId || items.length === 0) {
      return;
    }
    if (focusedContentHandledRef.current === focusContentId) {
      return;
    }
    if (!items.some((item) => item.id === focusContentId)) {
      return;
    }
    focusedContentHandledRef.current = focusContentId;
    setExpandedId(focusContentId);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`marketing-content-${focusContentId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusContentId, items]);

  useEffect(() => {
    function scrollToTable() {
      if (focusContentId || window.location.hash !== "#marketing-gaps") {
        return;
      }
      document.getElementById("marketing-gaps")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    scrollToTable();
    window.addEventListener("hashchange", scrollToTable);
    return () => window.removeEventListener("hashchange", scrollToTable);
  }, [focusContentId]);

  return (
    <Card id="marketing-gaps" className="scroll-mt-24">
      {deleteConfirm ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="marketing-delete-confirm-title"
          aria-describedby="marketing-delete-confirm-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border-2 border-destructive bg-background p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-3">
                <h2 id="marketing-delete-confirm-title" className="text-lg font-semibold">
                  Delete this marketing review?
                </h2>
                <p id="marketing-delete-confirm-description" className="text-sm text-muted-foreground">
                  This permanently removes <strong>{deleteConfirm.name}</strong> and its findings from
                  Marketing Gaps. This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => void deleteItem(deleteConfirm)}
                    disabled={deletingId === deleteConfirm.id}
                  >
                    {deletingId === deleteConfirm.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Yes, delete"
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
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Marketing Review Gaps</CardTitle>
          <CardDescription>
            Draft findings and options. Nothing is an approval until you send it to CCO review.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadItems()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!error && isLoading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading review history
          </div>
        ) : null}
        {!error && !isLoading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No marketing content has been submitted yet.</p>
        ) : null}
        {!error && !isLoading && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const typeLabel = contentTypeLabel(item.format);
              const addedContentLabel = formatAddedContentLabel(item.cosine_similarity);
              return (
                <article
                  id={`marketing-content-${item.id}`}
                  key={item.id}
                  className="min-w-0 scroll-mt-24 overflow-hidden rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {canDeleteResources ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 shrink-0 p-0 border-foreground text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteConfirm(item)}
                        disabled={deletingId === item.id}
                        aria-label={`Delete ${item.name}`}
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      >
                        Details
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
                        {addedContentLabel ? (
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {addedContentLabel}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {typeLabel ? (
                        <Badge variant="outline">{typeLabel}</Badge>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={
                          isCcoReviewInProgress(item) || item.status === "approved"
                            ? "border-transparent bg-foreground text-background"
                            : undefined
                        }
                      >
                        {item.status === "failed" ? (
                          <AlertTriangle className="mr-1 h-3 w-3" />
                        ) : isCcoReviewInProgress(item) ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : null}
                        {reviewStatusLabel(item)}
                      </Badge>
                    </div>
                  </div>
                  {isExpanded ? (
                    <MarketingReviewPanel
                      contentId={item.id}
                      authState={authState}
                      getAuthToken={getAuthToken}
                      orgId={orgId}
                      onSentToCcoReview={() => {
                        setItems((current) =>
                          current.map((row) =>
                            row.id === item.id
                              ? {
                                  ...row,
                                  status: "reviewed",
                                  latest_review_status: "signed_off",
                                  cco_review_in_progress: true,
                                }
                              : row
                          )
                        );
                      }}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
