"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GapImpactTimePoint } from "@/lib/analytics-types";

type GapsOverTimeChartProps = {
  data: GapImpactTimePoint[];
};

export function GapsOverTimeChart({ data }: GapsOverTimeChartProps) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No gap history is available yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="period_label" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
          <Tooltip
            contentStyle={{
              borderRadius: "0.5rem",
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="high" name="High" stroke="#dc2626" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="medium" name="Medium" stroke="#d97706" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="info" name="Info" stroke="#64748b" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
