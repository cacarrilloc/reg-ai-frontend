"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ComplianceHistoryPolicyItem,
  ComplianceHistoryTimePoint,
} from "@/lib/analytics-types";

type ComplianceHistoryInsightChartProps = {
  overTime: ComplianceHistoryTimePoint[];
  topPolicies: ComplianceHistoryPolicyItem[];
};

export function ComplianceHistoryInsightChart({
  overTime,
  topPolicies,
}: ComplianceHistoryInsightChartProps) {
  const totalIncidents = overTime.reduce((sum, point) => sum + point.incidents, 0);

  if (totalIncidents === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Compliance History incidents will appear here as gap analyses are recorded.
      </p>
    );
  }

  const maxPolicyCount = Math.max(
    1,
    ...topPolicies.map((item) => item.incident_count)
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {totalIncidents} incident{totalIncidents === 1 ? "" : "s"} over the last{" "}
        {overTime.length} weeks
        {topPolicies[0]
          ? ` · Most impacted: ${topPolicies[0].policy_name}`
          : null}
      </p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={overTime} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="period_label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
            <Tooltip
              contentStyle={{
                borderRadius: "0.5rem",
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--card))",
              }}
            />
            <Bar
              dataKey="incidents"
              name="Incidents"
              fill="#0f766e"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {topPolicies.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Top policies by incident count
          </p>
          {topPolicies.map((item) => (
            <div
              key={item.policy_name}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_auto] items-center gap-3 text-sm"
            >
              <span className="truncate font-medium" title={item.policy_name}>
                {item.policy_name}
              </span>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  className="h-2.5 rounded-full bg-teal-700 transition-all"
                  style={{
                    width: `${Math.max(8, (item.incident_count / maxPolicyCount) * 100)}%`,
                  }}
                />
              </div>
              <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                {item.incident_count}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
