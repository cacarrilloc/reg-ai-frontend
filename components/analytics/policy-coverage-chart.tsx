"use client";

import type { PolicyCoverageItem } from "@/lib/analytics-types";

type PolicyCoverageChartProps = {
  data: PolicyCoverageItem[];
};

function impactColor(item: PolicyCoverageItem): string {
  if (item.open_high_gaps > 0) {
    return "bg-red-500";
  }
  if (item.open_medium_gaps > 0) {
    return "bg-amber-500";
  }
  if (item.worst_impact === "INFO") {
    return "bg-slate-400";
  }
  return "bg-emerald-500";
}

function impactLabel(item: PolicyCoverageItem): string {
  if (item.open_high_gaps > 0) {
    return `${item.open_high_gaps} high`;
  }
  if (item.open_medium_gaps > 0) {
    return `${item.open_medium_gaps} medium`;
  }
  if (item.worst_impact === "INFO") {
    return "Info only";
  }
  return "Compliant";
}

export function PolicyCoverageChart({ data }: PolicyCoverageChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Upload internal policies to see coverage.
      </p>
    );
  }

  const maxGaps = Math.max(
    1,
    ...data.map((item) => item.open_high_gaps + item.open_medium_gaps + (item.worst_impact === "INFO" ? 1 : 0))
  );

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const gapCount = item.open_high_gaps + item.open_medium_gaps + (item.worst_impact === "INFO" ? 1 : 0);
        const widthPercent = item.worst_impact ? Math.max(8, (gapCount / maxGaps) * 100) : 8;

        return (
          <div key={item.policy_id} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_auto] items-center gap-3 text-sm">
            <span className="truncate font-medium" title={item.policy_name}>
              {item.policy_name}
            </span>
            <div className="h-3 rounded-full bg-muted">
              <div
                className={`h-3 rounded-full transition-all ${impactColor(item)}`}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground">{impactLabel(item)}</span>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Compliant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Medium gaps
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          High gaps
        </span>
      </div>
    </div>
  );
}
