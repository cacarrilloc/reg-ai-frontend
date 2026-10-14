"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ComplianceScoreCard } from "@/components/analytics/compliance-score-card";
import { ComplianceHistoryInsightChart } from "@/components/analytics/compliance-history-insight-chart";
import { GapsOverTimeChart } from "@/components/analytics/gaps-over-time-chart";
import { PolicyCoverageChart } from "@/components/analytics/policy-coverage-chart";
import { SimilarityHistogram } from "@/components/analytics/similarity-histogram";
import { UsageSummaryCard } from "@/components/analytics/usage-summary-card";
import { DashboardShell, PageChromeCard } from "@/components/dashboard/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { AnalyticsDashboardResponse } from "@/lib/analytics-types";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";

export default function InsightsPage() {
  if (!isAuthConfigured()) {
    return <InsightsPageContent orgId={getLocalDevOrgId()} />;
  }

  return <AuthedInsightsPage />;
}

function AuthedInsightsPage() {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <InsightsPageContent
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
    />
  );
}

function InsightsPageContent({
  authState = "ready",
  getAuthToken,
  orgId,
}: {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
}) {
  const [analytics, setAnalytics] = useState<AnalyticsDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const loadInsights = useCallback(async (options?: { silent?: boolean }) => {
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
      const response = await apiFetch<AnalyticsDashboardResponse>(
        "/api/v1/analytics/dashboard",
        undefined,
        { token, orgId }
      );
      setAnalytics(response);
      hasLoadedOnceRef.current = true;
    } catch (caught) {
      if (!silent) {
        setAnalytics(null);
        setError(caught instanceof Error ? caught.message : "Unable to load insights.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  return (
    <DashboardShell
      title="Compliance Insights"
      description="Compliance posture, gap exposure, redline alignment, and Compliance History pressure."
    >
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <PageChromeCard
          title={
            <span className="flex items-center gap-2 text-base">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading insights
            </span>
          }
          titleClassName="text-base"
        />
      ) : null}

      {!isLoading && analytics ? (
        <div className="space-y-6">
          <UsageSummaryCard authState={authState} getAuthToken={getAuthToken} orgId={orgId} />
          <ComplianceScoreCard insights={analytics.insights} />

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Gaps by impact over time</CardTitle>
                <CardDescription>New gap analyses grouped by week for the last 12 weeks.</CardDescription>
              </CardHeader>
              <CardContent>
                <GapsOverTimeChart data={analytics.gaps_by_impact_over_time} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Policy Coverage</CardTitle>
                <CardDescription>Internal policies ranked by open high- and medium-impact gaps.</CardDescription>
              </CardHeader>
              <CardContent>
                <PolicyCoverageChart data={analytics.policy_coverage} />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Redline vs Internal Policy</CardTitle>
                <CardDescription>
                  Mean-max cosine similarity between the proposed (accepted) LLM redline text and
                  the source internal policy embeddings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimilarityHistogram
                  title="Internal alignment"
                  description="Higher scores mean the proposed redline language stayed closer to the existing policy."
                  buckets={analytics.insights.redline_internal_histogram}
                  average={analytics.insights.average_redline_internal_similarity}
                  sampleSize={analytics.insights.redline_internal_sample_size}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compliance History Pressure</CardTitle>
                <CardDescription>
                  Gap incidents recorded in Compliance History over the last 12 weeks, plus the
                  policies appearing most often.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ComplianceHistoryInsightChart
                  overTime={analytics.compliance_history_over_time ?? []}
                  topPolicies={analytics.compliance_history_top_policies ?? []}
                />
              </CardContent>
            </Card>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
