"use client";

import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsInsights } from "@/lib/analytics-types";

type ComplianceScoreCardProps = {
  insights: AnalyticsInsights;
};

export function ComplianceScoreCard({ insights }: ComplianceScoreCardProps) {
  const score = insights.compliance_score;
  const hasPolicies = insights.total_internal_policies > 0;
  const scoreColor =
    !hasPolicies
      ? "text-muted-foreground"
      : score >= 90
        ? "text-emerald-600 dark:text-emerald-400"
        : score >= 70
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Compliance Score
        </CardTitle>
        <CardDescription>
          Share of internal policies with all high- and medium-impact gaps resolved. A gap counts as
          resolved only after its redline revision is approved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`text-5xl font-bold ${scoreColor}`}>
          {hasPolicies ? `${score.toFixed(1)}%` : "—"}
        </div>
        {hasPolicies ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {insights.compliant_policies} of {insights.total_internal_policies} internal policies have
            all high- and medium-impact gaps resolved.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Upload internal policies to calculate a compliance score.
          </p>
        )}
        {insights.open_high_gaps > 0 || insights.open_medium_gaps > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Currently open: {insights.open_high_gaps} high-impact
            {insights.open_medium_gaps > 0 ? ` · ${insights.open_medium_gaps} medium-impact` : ""} gap
            {insights.open_high_gaps + insights.open_medium_gaps === 1 ? "" : "s"} across the library.
          </p>
        ) : null}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
