"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExternalLink, FilterX, Loader2, RefreshCw, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { NewsletterInviteCard } from "@/components/publications/newsletter-invite-card";
import { PublicationShareMenu } from "@/components/publications/publication-share-menu";
import { RegulatorySyncButton } from "@/components/regulatory/regulatory-sync-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MarkdownContent } from "@/components/ui/markdown-content";
import {
  tableCellClassName,
  tableFrameClassName,
  tableFrameRowClassName,
  tableFrameTableClassName,
  tableHeadClassName,
} from "@/lib/table-styles";
import { cn } from "@/lib/utils";

const VISIBLE_PUBLICATION_LIMIT = 7;
const SUMMARY_COLLAPSED_CHAR_LIMIT = 220;
const FEED_SOURCE_ORDER = ["SEC", "FINRA", "CFTC"] as const;

type Publication = {
  id: string;
  source: string;
  title: string;
  url: string;
  published_at: string | null;
  processed: boolean;
  status?: "ingested" | "matched" | string;
  summary: string | null;
  created_at: string;
};

type ColumnFilters = {
  publication: string;
  source: string;
  date: string;
  summary: string;
  status: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  publication: "",
  source: "",
  date: "",
  summary: "",
  status: "",
};

type GetAuthToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

type PublicationsFeedProps = {
  mode?: "app" | "public";
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: GetAuthToken;
  orgId?: string | null;
};

export function PublicationsFeed({ mode = "app" }: PublicationsFeedProps) {
  if (mode === "public") {
    return <PublicationsFeedContent mode="public" />;
  }
  if (!isAuthConfigured()) {
    return <PublicationsFeedContent orgId={getLocalDevOrgId()} />;
  }

  return <AuthedPublicationsFeed />;
}

function AuthedPublicationsFeed() {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <PublicationsFeedContent
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
    />
  );
}

function PublicationsFeedContent({
  mode = "app",
  authState = "ready",
  getAuthToken,
  orgId,
}: PublicationsFeedProps) {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const deferredFilters = useDeferredValue(filters);
  const hasLoadedOnceRef = useRef(false);

  const loadPublications = useCallback(async (options?: { silent?: boolean }) => {
    const isPublic = mode === "public";
    if (!isPublic && authState === "loading") {
      return;
    }
    if (!isPublic && authState === "signed-out") {
      setPublications([]);
      setError("Sign in to view your regulatory feed.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const hasLoadedOnce = hasLoadedOnceRef.current;
    // Explicit `silent: false` (Refresh) must not fall back to the "already loaded" default.
    const silent = options?.silent ?? hasLoadedOnce;
    if (!silent) {
      if (hasLoadedOnce) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
    }
    try {
      const token = isPublic
        ? null
        : getAuthToken
          ? await getAuthToken(hasLoadedOnce && !silent ? { skipCache: true } : undefined)
          : null;
      if (!isPublic && getAuthToken && !token) {
        throw new Error("Sign in to view your regulatory feed.");
      }
      const basePath = isPublic
        ? "/api/v1/newsletter/publications?limit=50"
        : "/api/v1/regulatory/publications?limit=50";
      const path = !silent && hasLoadedOnce ? `${basePath}&_=${Date.now()}` : basePath;
      const response = await apiFetch<Publication[]>(
        path,
        undefined,
        isPublic ? undefined : { token, orgId }
      );
      setPublications(response);
      hasLoadedOnceRef.current = true;
      if (!silent) {
        setError(null);
      }
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unable to load the regulatory feed.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [authState, getAuthToken, mode, orgId]);

  useEffect(() => {
    void loadPublications();
  }, [loadPublications]);

  const filteredPublications = useMemo(() => {
    const normalized = Object.fromEntries(
      Object.entries(deferredFilters).map(([key, value]) => [
        key,
        value.trim().toLocaleLowerCase(),
      ])
    ) as Record<keyof ColumnFilters, string>;

    return publications.filter((publication) => {
      const status = publicationFeedStatus(publication);
      const values: Record<keyof ColumnFilters, string> = {
        publication: publication.title,
        source: publication.source,
        date: formatPublicationDate(publication.published_at || publication.created_at),
        summary: publication.summary?.trim() || "Full text pending scrape.",
        status: statusLabel(status),
      };
      return Object.entries(normalized).every(([key, query]) => {
        if (!query) return true;
        return values[key as keyof ColumnFilters]
          .toLocaleLowerCase()
          .includes(query);
      });
    });
  }, [publications, deferredFilters]);

  const hasFilters = Object.values(filters).some((value) => value.trim());
  const rankedPublications = hasFilters
    ? filteredPublications
    : pinOnePublicationPerSource(filteredPublications, FEED_SOURCE_ORDER);
  const visiblePublications = showAllRows
    ? rankedPublications
    : rankedPublications.slice(0, VISIBLE_PUBLICATION_LIMIT);
  const hiddenCount = Math.max(rankedPublications.length - VISIBLE_PUBLICATION_LIMIT, 0);

  function updateFilter(key: keyof ColumnFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setShowAllRows(false);
  }

  const isPublic = mode === "public";

  return (
    <div className="space-y-6">
      {isPublic ? null : (
        <NewsletterInviteCard
          authState={authState}
          getAuthToken={getAuthToken}
          orgId={orgId}
        />
      )}
      <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>News Publications</CardTitle>
          <CardDescription>
            {isPublic
              ? "The same shared SEC, FINRA, and CFTC scrape as the Regulatory Feed. Filter any column to narrow the list."
              : "Only sources configured for the active organization are displayed. Filter any column to narrow the feed."}
          </CardDescription>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setShowAllRows(false);
              }}
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          ) : null}
          {isPublic ? null : (
            <RegulatorySyncButton
              authState={authState}
              getAuthToken={getAuthToken}
              orgId={orgId}
              onSyncStarted={() => {
                void loadPublications({ silent: true });
              }}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void loadPublications({ silent: false })}
            disabled={isLoading || isRefreshing || (!isPublic && authState !== "ready")}
            aria-label="Refresh news publications"
            aria-busy={isLoading || isRefreshing}
          >
            {isLoading || isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!error && isLoading && publications.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading publications
          </div>
        ) : null}
        {!error && !isLoading && publications.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">No publications are available for this regulatory scope.</p>
        ) : null}
        {publications.length > 0 ? (
          <div className="space-y-3">
            <div className={tableFrameClassName}>
              <table className={`w-full min-w-[820px] text-center text-sm ${tableFrameTableClassName}`}>
                <thead className={tableHeadClassName}>
                  <tr>
                    <th>Publication</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>Summary</th>
                    <th>Status</th>
                    <th>Share</th>
                  </tr>
                  <tr className="border-t bg-background [&_th]:px-2 [&_th]:pb-2.5 [&_th]:pt-2">
                    <FilterCell
                      label="Publication"
                      value={filters.publication}
                      onChange={(value) => updateFilter("publication", value)}
                    />
                    <FilterCell
                      label="Source"
                      value={filters.source}
                      onChange={(value) => updateFilter("source", value)}
                    />
                    <FilterCell
                      label="Date"
                      value={filters.date}
                      onChange={(value) => updateFilter("date", value)}
                    />
                    <FilterCell
                      label="Summary"
                      value={filters.summary}
                      onChange={(value) => updateFilter("summary", value)}
                    />
                    <FilterCell
                      label="Status"
                      value={filters.status}
                      onChange={(value) => updateFilter("status", value)}
                    />
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {visiblePublications.map((publication) => {
                    const status = publicationFeedStatus(publication);
                    return (
                      <tr key={publication.id} className={tableFrameRowClassName}>
                        <td className={cn(tableCellClassName, "max-w-[440px] px-3 py-4 font-medium")}>
                          <a
                            href={publication.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-start justify-center gap-2 hover:text-primary hover:underline"
                          >
                            <span>{publication.title}</span>
                            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Open source publication" />
                          </a>
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-4")}>
                          <Badge variant="outline">{publication.source}</Badge>
                        </td>
                        <td className={cn(tableCellClassName, "whitespace-nowrap px-3 py-4 text-muted-foreground")}>
                          {formatPublicationDate(publication.published_at || publication.created_at)}
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-4 text-muted-foreground")}>
                          {publication.summary ? (
                            <div className="min-w-0 max-w-3xl text-left">
                              <ExpandableMarkdownSummary text={publication.summary} />
                            </div>
                          ) : (
                            "Full text pending scrape."
                          )}
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-4")}>
                          <Badge
                            variant="outline"
                            className={
                              status === "matched"
                                ? "border-destructive text-destructive"
                                : undefined
                            }
                          >
                            {statusLabel(status)}
                          </Badge>
                        </td>
                        <td className={cn(tableCellClassName, "px-3 py-4")}>
                          <PublicationShareMenu
                            title={publication.title}
                            url={publication.url}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredPublications.length === 0 ? (
                <div className="border-t px-5 py-8 text-center text-sm text-muted-foreground">
                  No publications match all selected filters.
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
      </Card>
    </div>
  );
}

function pinOnePublicationPerSource(
  rows: Publication[],
  sources: readonly string[],
): Publication[] {
  if (rows.length === 0) {
    return rows;
  }
  const used = new Set<string>();
  const pinned: Publication[] = [];
  for (const source of sources) {
    const match = rows.find((row) => {
      return row.source.trim().toUpperCase() === source && !used.has(row.id);
    });
    if (match) {
      pinned.push(match);
      used.add(match.id);
    }
  }
  return [...pinned, ...rows.filter((row) => !used.has(row.id))];
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

function publicationFeedStatus(publication: Publication): "ingested" | "matched" {
  if (publication.status === "matched" || publication.status === "ingested") {
    return publication.status;
  }
  // Fallback for older API responses / cached payloads.
  if (publication.status === "processing" || publication.status === "ingesting") {
    return "ingested";
  }
  if (publication.processed || publication.status === "processed") {
    return "matched";
  }
  return "ingested";
}

function statusLabel(status: "ingested" | "matched"): string {
  return status === "matched" ? "Matched" : "Ingested";
}

function summaryNeedsToggle(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > SUMMARY_COLLAPSED_CHAR_LIMIT ||
    trimmed.endsWith("…") ||
    trimmed.endsWith("...")
  );
}

function ExpandableMarkdownSummary({ text }: { text: string }) {
  const collapsedRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(() => summaryNeedsToggle(text));

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const collapsed = collapsedRef.current;
    const full = fullRef.current;
    if (!collapsed || !full) {
      return;
    }

    const measure = () => {
      const heightOverflows = full.scrollHeight > collapsed.clientHeight + 1;
      setOverflows(heightOverflows || summaryNeedsToggle(text));
    };
    const frame = requestAnimationFrame(measure);
    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(collapsed);
    observer.observe(full);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text]);

  return (
    <div>
      <div className="relative">
        <div ref={collapsedRef} className={expanded ? undefined : "line-clamp-4"}>
          {expanded ? (
            <MarkdownContent text={text} />
          ) : (
            <p className="break-words leading-relaxed [overflow-wrap:anywhere]">{text}</p>
          )}
        </div>
        <div
          ref={fullRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-0 overflow-hidden opacity-0"
        >
          <p className="break-words leading-relaxed [overflow-wrap:anywhere]">{text}</p>
        </div>
      </div>
      {overflows || expanded ? (
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

function formatPublicationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}
