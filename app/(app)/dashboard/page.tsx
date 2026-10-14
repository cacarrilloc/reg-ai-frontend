"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FilePenLine,
  Loader2,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceHistoryTable } from "@/components/dashboard/compliance-history-table";
import { PendingApprovalsTable } from "@/components/dashboard/pending-approvals-table";
import { DashboardShell } from "@/components/dashboard/shell";
import { apiFetch } from "@/lib/api";
import { cacheKey, cachedApiFetch } from "@/lib/api-cache";
import type { AnalyticsKpis } from "@/lib/analytics-types";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";

type GapAnalysis = {
  id: string;
  policy_id: string;
  policy_name: string;
  trigger_type: "publication" | "business_change" | "policy_update";
  trigger_id: string;
  trigger_label: string;
  impact_score: "HIGH" | "MEDIUM" | "INFO";
  created_at: string;
};

export default function DashboardPage() {
  if (!isAuthConfigured()) {
    return <DashboardPageContent orgId={getLocalDevOrgId()} />;
  }

  return <AuthedDashboardPage />;
}

function AuthedDashboardPage() {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <DashboardPageContent
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
    />
  );
}

function DashboardPageContent({
  authState = "ready",
  getAuthToken,
  orgId,
}: {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
}) {
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null);
  const [highGaps, setHighGaps] = useState<GapAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (authState !== "ready") {
      setIsLoading(false);
      return;
    }

    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const gapsPath = "/api/v1/gap-analyses?limit=5&impact_score=HIGH&include_findings=false";
      const [kpiResult, highGapResult] = await Promise.allSettled([
        cachedApiFetch(
          cacheKey("/api/v1/analytics/kpis", orgId),
          () => apiFetch<AnalyticsKpis>("/api/v1/analytics/kpis", undefined, { token, orgId }),
          { ttlMs: 20_000 }
        ),
        cachedApiFetch(
          cacheKey(gapsPath, orgId),
          () => apiFetch<GapAnalysis[]>(gapsPath, undefined, { token, orgId }),
          { ttlMs: 20_000 }
        ),
      ]);

      if (kpiResult.status === "fulfilled") {
        setKpis(kpiResult.value);
      } else if (!silent) {
        setKpis(null);
      }

      if (highGapResult.status === "fulfilled") {
        setHighGaps(highGapResult.value);
      } else if (!silent) {
        setHighGaps([]);
      }

      hasLoadedOnceRef.current = true;
    } catch {
      if (!silent) {
        setKpis(null);
        setHighGaps([]);
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const openHighGaps = kpis?.open_high_gaps ?? 0;
  const metrics = [
    { label: "Open high gaps", value: kpis?.open_high_gaps ?? "—", icon: AlertTriangle, alert: openHighGaps >= 1 },
    { label: "Pending reviews", value: kpis?.pending_reviews ?? "—", icon: Clock, alert: false },
    { label: "Overdue", value: kpis?.overdue_reviews ?? "—", icon: Timer, alert: false },
    { label: "Redlines ready", value: kpis?.redlines_ready ?? "—", icon: FilePenLine, alert: false },
    { label: "Approved (month)", value: kpis?.approved_this_month ?? "—", icon: CheckCircle2, alert: false },
  ];

  return (
    <DashboardShell
      title="CCO Dashboard"
      description="Monitor regulatory changes, open gaps, and jump to policies or reviews."
    >
      <div className="space-y-6">
        <PendingApprovalsTable
          authState={authState}
          getAuthToken={getAuthToken}
          orgId={orgId}
        />

        <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.625fr)_minmax(0,0.525fr)]">
          <ComplianceHistoryTable
            authState={authState}
            getAuthToken={getAuthToken}
            orgId={orgId}
          />

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">High Impact Gaps</CardTitle>
              <CardDescription>Policies that need attention first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {highGaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open high-impact gaps.</p>
              ) : (
                highGaps.map((item) => (
                  <Link
                    key={item.id}
                    href={`/compliance-gaps?gap_id=${encodeURIComponent(item.id)}`}
                    className="block rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.policy_name}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.trigger_label}</p>
                      </div>
                      <Badge className="shrink-0 border-destructive text-destructive">{item.impact_score}</Badge>
                    </div>
                  </Link>
                ))
              )}
              <div className="space-y-1 border-t pt-3">
                <p className="px-2 pb-1 text-sm font-medium">System Metrics:</p>
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className={
                      metric.alert
                        ? "flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-2 py-2"
                        : "flex items-center justify-between rounded-md px-2 py-2"
                    }
                  >
                    <div className="flex items-center gap-2">
                      <metric.icon
                        className={
                          metric.alert
                            ? "h-4 w-4 text-destructive"
                            : "h-4 w-4 text-muted-foreground"
                        }
                      />
                      <span
                        className={
                          metric.alert
                            ? "text-sm font-medium text-destructive"
                            : "text-sm text-muted-foreground"
                        }
                      >
                        {metric.label}
                      </span>
                    </div>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span
                        className={
                          metric.alert
                            ? "text-lg font-semibold tabular-nums text-destructive"
                            : "text-lg font-semibold tabular-nums"
                        }
                      >
                        {metric.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <Button asChild variant="ghost" className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-primary hover:underline">
                <Link href="/compliance-gaps">Open Regulatory Compliance Gaps</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardShell>
  );
}
