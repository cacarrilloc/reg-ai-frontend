"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type UsageSummaryResponse = {
  org_id: string;
  totals: Record<string, number>;
  daily: Array<{ day: string; metric: string; count: number }>;
};

export type UsageSummaryCardProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
};

/**
 * Renders org usage counters from /api/v1/usage/summary.
 * Hides itself when the endpoint is unavailable.
 */
export function UsageSummaryCard({ authState = "ready", getAuthToken, orgId }: UsageSummaryCardProps) {
  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadUsage() {
      if (authState !== "ready") {
        return;
      }
      try {
        const token = getAuthToken ? await getAuthToken() : null;
        const response = await apiFetch<UsageSummaryResponse>("/api/v1/usage/summary", undefined, {
          token,
          orgId
        });
        if (!cancelled) {
          setSummary(response);
        }
      } catch {
        if (!cancelled) {
          setIsAvailable(false);
        }
      }
    }

    void loadUsage();
    return () => {
      cancelled = true;
    };
  }, [authState, getAuthToken, orgId]);

  if (!isAvailable || !summary) {
    return null;
  }

  const metrics = Object.entries(summary.totals || {}).map(([label, value]) => ({ label, value }));
  if (metrics.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Plan usage
        </CardTitle>
        <CardDescription>API and agent consumption tracked for this organization.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {metric.label.replace(/_/g, " ")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{metric.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
