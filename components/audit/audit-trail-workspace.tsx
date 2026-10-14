"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, FileCheck2, FileText, Loader2, RefreshCw, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { normalizeImpactScore, formatAuditTrailGapSummary } from "@/lib/gap-analysis-text";
import { GapSummaryCell } from "@/components/gap-analyses/gap-summary-cell";
import type { GapFindingItem } from "@/components/gap-analyses/gap-findings-dropdown";
import { TriggerBadge } from "@/components/shared/trigger-badge";
import { tableCellClassName, tableColumnLabelClassName } from "@/lib/table-styles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shared column tracks so header + every row stay aligned.
 *  minmax(0, …) prevents long unbroken strings (e.g. user IDs) from
 *  expanding a track and desynchronizing columns across rows.
 */
const AUDIT_CHAIN_COLS =
  "gap-4 px-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.55fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,1fr)]";

const AUDIT_CHAIN_CELL_CLASS = `${tableCellClassName} min-w-0`;

type AuditChainResponse = {
  chains: PolicyAuditChain[];
  total_chains: number;
};

type PolicyAuditChain = {
  policy_id: string;
  policy_name: string;
  policy_version: number;
  trigger_type: "publication" | "business_change" | string;
  trigger_label: string;
  trigger_id: string;
  gap_analysis_id: string;
  gap_summary: string;
  impact_score: "HIGH" | "MEDIUM" | "INFO" | string;
  gaps?: GapFindingItem[];
  redline_revision_id: string | null;
  redline_status: string | null;
  redline_created_at: string | null;
  reviewer_id: string | null;
  decision: string | null;
  decision_at: string | null;
  decision_notes: string | null;
  audit_log_id: string | null;
  approved_file_url: string | null;
};

type AuditTrailProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
};

export function AuditTrailWorkspace() {
  if (!isAuthConfigured()) {
    return <AuditTrailContent orgId={getLocalDevOrgId()} />;
  }

  return <AuthedAuditTrail />;
}

function AuthedAuditTrail() {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <AuditTrailContent
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
    />
  );
}

function AuditTrailContent({
  authState = "ready",
  getAuthToken,
  orgId
}: AuditTrailProps) {
  const [response, setResponse] = useState<AuditChainResponse | null>(null);
  const [historyResponse, setHistoryResponse] = useState<AuditChainResponse | null>(null);
  const [viewMode, setViewMode] = useState<"chains" | "history">("chains");
  const [policyFilter, setPolicyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const chains = useMemo(
    () => (viewMode === "history" ? historyResponse?.chains : response?.chains) ?? [],
    [historyResponse, response, viewMode]
  );
  const policies = useMemo(() => {
    const unique = new Map<string, string>();
    for (const chain of chains) {
      unique.set(chain.policy_id, chain.policy_name);
    }
    return Array.from(unique.entries()).sort((first, second) => first[1].localeCompare(second[1]));
  }, [chains]);

  const filteredChains = chains.filter((chain) => {
    if (policyFilter !== "ALL" && chain.policy_id !== policyFilter) {
      return false;
    }
    if (statusFilter === "ALL") {
      return true;
    }
    return (chain.decision || chain.redline_status || "NO_REDLINE") === statusFilter;
  });

  const groupedChains = useMemo(() => {
    const grouped = new Map<string, PolicyAuditChain[]>();
    for (const chain of filteredChains) {
      const key = `${chain.policy_name}|${chain.policy_id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), chain]);
    }
    return Array.from(grouped.entries());
  }, [filteredChains]);

  const approvedCount = chains.filter((chain) => chain.decision === "APPROVED").length;
  const rejectedCount = chains.filter((chain) => chain.decision === "REJECTED").length;
  const pendingCount = chains.filter((chain) => (chain.redline_status || "") === "PENDING").length;

  const loadAuditTrail = useCallback(async (options?: { silent?: boolean }) => {
    if (authState === "loading") {
      return;
    }
    if (authState === "signed-out") {
      setResponse(null);
      setHistoryResponse(null);
      setError("Sign in to view audit evidence.");
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
      if (getAuthToken && !token) {
        throw new Error("Sign in to view audit evidence.");
      }
      const [chainsData, historyData] = await Promise.all([
        apiFetch<AuditChainResponse>(
          "/api/v1/reviews/audit-chains?limit=100",
          undefined,
          { token, orgId }
        ),
        apiFetch<{ decisions: PolicyAuditChain[]; total_decisions: number }>(
          "/api/v1/reviews/history?limit=100",
          undefined,
          { token, orgId }
        )
      ]);
      setResponse(chainsData);
      setHistoryResponse({
        chains: historyData.decisions,
        total_chains: historyData.total_decisions
      });
      hasLoadedOnceRef.current = true;
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unable to load audit history.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadAuditTrail();
  }, [loadAuditTrail]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Chains" value={viewMode === "history" ? historyResponse?.total_chains ?? 0 : response?.total_chains ?? 0} icon={FileText} />
        <Metric label="Pending" value={pendingCount} icon={Clock} tone="warning" />
        <Metric label="Approved" value={approvedCount} icon={CheckCircle2} tone="success" />
        <Metric label="Rejected" value={rejectedCount} icon={XCircle} tone="destructive" />
      </section>

      <Card>
        <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>{viewMode === "history" ? "Decision History" : "Policy Audit Chains"}</CardTitle>
            <CardDescription>
              {viewMode === "history"
                ? "Approved, rejected, and partially accepted redlines for business changes, marketing reviews, and HIGH/MEDIUM gap analyses."
                : "Trace business changes and material gap analyses from trigger through redline, reviewer decision, and timestamp."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-1">
              <Button
                variant={viewMode === "chains" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("chains")}
              >
                Audit chains
              </Button>
              <Button
                variant={viewMode === "history" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("history")}
              >
                Decision history
              </Button>
            </div>
            <label className="sr-only" htmlFor="audit-policy-filter">Policy</label>
            <select
              id="audit-policy-filter"
              value={policyFilter}
              onChange={(event) => setPolicyFilter(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="ALL">All policies</option>
              {policies.map(([policyId, policyName]) => (
                <option key={policyId} value={policyId}>{policyName}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="audit-status-filter">Status</label>
            <select
              id="audit-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PARTIALLY_ACCEPTED">Partially accepted</option>
              <option value="NO_REDLINE">No redline</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAuditTrail()}
              disabled={isLoading || authState !== "ready"}
              aria-label="Refresh audit history"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!error && isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading audit history
            </div>
          ) : null}
          {!error && !isLoading && filteredChains.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
              <FileCheck2 className="mb-3 h-6 w-6 text-muted-foreground" />
              <p className="font-medium">No audit chains found</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Audit chains include every business change, marketing review, plus any HIGH or MEDIUM gap analysis.
              </p>
            </div>
          ) : null}
          {!error && !isLoading && groupedChains.length > 0 ? (
            <div className="space-y-5">
              {groupedChains.map(([groupKey, policyChains]) => {
                const [policyName] = groupKey.split("|");
                return (
                  <section key={groupKey} className="rounded-lg border">
                    <div className="border-b px-4 py-3">
                      <h2 className="font-semibold">{policyName}</h2>
                      <p className="text-sm text-muted-foreground">{policyChains.length} audit {policyChains.length === 1 ? "chain" : "chains"}</p>
                    </div>
                    <div className={`hidden border-b py-3 xl:grid ${AUDIT_CHAIN_COLS}`}>
                      {["Trigger", "Severity", "Gap", "Redline", "Decision"].map((label) => (
                        <p key={label} className={tableColumnLabelClassName}>
                          {label}
                        </p>
                      ))}
                    </div>
                    <div className="divide-y">
                      {policyChains.map((chain) => (
                        <AuditChainRow key={`${chain.gap_analysis_id}-${chain.redline_revision_id ?? "gap"}`} chain={chain} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditChainRow({ chain }: { chain: PolicyAuditChain }) {
  return (
    <article className={`grid py-4 ${AUDIT_CHAIN_COLS}`}>
      <div className={AUDIT_CHAIN_CELL_CLASS}>
        <p className={`${tableColumnLabelClassName} xl:sr-only`}>Trigger</p>
        <div className="mt-2 flex justify-center">
          <TriggerBadge triggerType={chain.trigger_type} />
        </div>
        <p className="mt-2 break-words text-sm">{chain.trigger_label}</p>
      </div>
      <div className={AUDIT_CHAIN_CELL_CLASS}>
        <p className={`${tableColumnLabelClassName} xl:sr-only`}>Severity</p>
        <div className="mt-2 flex justify-center">
          <ImpactBadge impact={chain.impact_score} />
        </div>
      </div>
      <div className={`${AUDIT_CHAIN_CELL_CLASS} !text-left`}>
        <p className={`${tableColumnLabelClassName} xl:sr-only`}>Gap</p>
        <GapSummaryCell
          summary={formatAuditTrailGapSummary(
            chain.policy_name,
            chain.gaps ?? [],
            chain.gap_summary
          )}
          policyName={chain.policy_name}
          className="w-full min-w-0 text-justify [&_button]:mx-0 [&_p]:w-full [&_p]:break-words [&_p]:text-justify"
        />
      </div>
      <div className={AUDIT_CHAIN_CELL_CLASS}>
        <p className={`${tableColumnLabelClassName} xl:sr-only`}>Redline</p>
        <div className="mt-2 flex justify-center">
          <StatusBadge status={chain.redline_status} decision={chain.decision} />
        </div>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {chain.redline_created_at ? `Created ${formatDate(chain.redline_created_at)}` : "No redline generated"}
        </p>
      </div>
      <div className={AUDIT_CHAIN_CELL_CLASS}>
        <p className={`${tableColumnLabelClassName} xl:sr-only`}>Decision</p>
        <p className="mt-2 break-words text-sm">
          {chain.decision ? formatAuditDecision(chain.decision) : "Awaiting review"}
        </p>
        <p className="mt-1 break-all text-sm text-muted-foreground" title={chain.reviewer_id ?? undefined}>
          {chain.reviewer_id ? `Reviewer ${chain.reviewer_id}` : "No reviewer recorded"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {chain.decision_at ? formatDate(chain.decision_at) : "No decision date"}
        </p>
        {chain.decision_notes ? (
          <p className="mt-2 break-words text-sm">
            <span className="font-medium">Review notes: </span>
            {chain.decision_notes}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = "default"
}: {
  label: string;
  value: number;
  icon: typeof FileText;
  tone?: "default" | "warning" | "success" | "destructive";
}) {
  const className =
    tone === "warning"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "success"
        ? "text-emerald-700 dark:text-emerald-400"
        : tone === "destructive"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${className}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const normalized = normalizeImpactScore(impact);
  const className =
    normalized === "HIGH"
      ? "border-destructive text-destructive"
      : normalized === "MEDIUM"
        ? "border-amber-500 text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";
  return <Badge variant="outline" className={className}>{normalized}</Badge>;
}

function formatAuditDecision(decision: string): string {
  if (decision === "PARTIALLY_ACCEPTED") return "Partially accepted";
  if (decision === "APPROVED") return "Approved";
  if (decision === "REJECTED") return "Rejected";
  return decision.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function StatusBadge({ status, decision }: { status: string | null; decision: string | null }) {
  const resolved = decision || status || "NO_REDLINE";
  if (resolved === "APPROVED") {
    return (
      <Badge variant="outline" className="border-transparent bg-foreground text-background">
        Approved
      </Badge>
    );
  }
  if (resolved === "PARTIALLY_ACCEPTED") {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
        Partially accepted
      </Badge>
    );
  }
  if (resolved === "REJECTED") {
    return <Badge variant="outline">Rejected</Badge>;
  }
  if (resolved === "PENDING") {
    return <Badge variant="outline">Pending</Badge>;
  }
  return <Badge variant="outline">No redline</Badge>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}
