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
import type { SimilarityHistogramBucket } from "@/lib/analytics-types";

type SimilarityHistogramProps = {
  title: string;
  description: string;
  buckets: SimilarityHistogramBucket[];
  average: number | null;
  sampleSize: number;
};

export function SimilarityHistogram({
  title,
  description,
  buckets,
  average,
  sampleSize,
}: SimilarityHistogramProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {sampleSize === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Similarity scores appear after redlines are generated.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Average similarity: {average !== null ? average.toFixed(3) : "—"} · {sampleSize} redline
            {sampleSize === 1 ? "" : "s"}
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.5rem",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Bar dataKey="count" name="Redlines" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
