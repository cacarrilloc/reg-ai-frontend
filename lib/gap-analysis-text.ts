export type GapImpactScore = "HIGH" | "MEDIUM" | "INFO";

export function normalizeImpactScore(impact: string): GapImpactScore {
  const upper = impact.trim().toUpperCase();
  if (upper === "HIGH" || upper === "CRITICAL") {
    return "HIGH";
  }
  if (upper === "MEDIUM") {
    return "MEDIUM";
  }
  return "INFO";
}

export function isInformationalImpact(impact: string): boolean {
  return normalizeImpactScore(impact) === "INFO";
}

const BUSINESS_CHANGE_TYPE_LABELS: Record<string, string> = {
  NEW_PRODUCT: "New product",
  NEW_PROCESS: "New process",
  NEW_HIRE: "New hire",
  NEW_MARKET: "New market",
  OTHER: "Other"
};

export function formatBusinessChangeType(changeType: string | null | undefined): string | null {
  if (!changeType?.trim()) {
    return null;
  }
  const normalized = changeType.trim().toUpperCase();
  return BUSINESS_CHANGE_TYPE_LABELS[normalized] ?? changeType.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncateWords(text: string, maxWords: number): { preview: string; truncated: boolean } {
  const normalized = text.trim();
  if (!normalized) {
    return { preview: "", truncated: false };
  }

  const words = normalized.split(/\s+/);
  if (words.length <= maxWords) {
    return { preview: normalized, truncated: false };
  }

  return {
    preview: `${words.slice(0, maxWords).join(" ")}…`,
    truncated: true
  };
}

export const IMPACT_SORT_ORDER: Record<GapImpactScore, number> = {
  HIGH: 0,
  MEDIUM: 1,
  INFO: 2
};

export function sortAnalysesByImpact<T extends { impact_score: string; created_at: string }>(
  analyses: T[]
): T[] {
  return [...analyses].sort((left, right) => {
    const impactDelta =
      IMPACT_SORT_ORDER[normalizeImpactScore(left.impact_score)] -
      IMPACT_SORT_ORDER[normalizeImpactScore(right.impact_score)];
    if (impactDelta !== 0) {
      return impactDelta;
    }
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

export function formatCosineSimilarity(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return `${(value * 100).toFixed(1)}%`;
}

/** Share of the policy that is new: 100 minus the displayed cosine percentage. */
export function formatAddedContent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  const cosinePercent = Number((value * 100).toFixed(1));
  const addedPercent = Math.min(100, Math.max(0, 100 - cosinePercent));
  return `${addedPercent.toFixed(1)}%`;
}

export function formatAddedContentLabel(value: number | null | undefined): string | null {
  const percent = formatAddedContent(value);
  return percent ? `Added Content: ${percent}` : null;
}

export function formatGovRegulationFrameworkLabel(
  value: number | null | undefined
): string | null {
  const percent = formatAddedContent(value);
  return percent ? `Content added from Gov. Regulation Framework: ${percent}` : null;
}

/** Build a numbered all-gaps summary for the Audit Trail Gap column only. */
export function formatAuditTrailGapSummary(
  policyName: string,
  gaps: Array<{ summary: string; rule?: string | null }>,
  fallbackSummary: string
): string {
  const items = gaps
    .map((gap) => ({
      summary: gap.summary.trim(),
      rule: gap.rule?.trim() || "",
    }))
    .filter((gap) => gap.summary);

  if (items.length === 0) {
    return fallbackSummary;
  }

  // Single legacy row that already is the stored one-line summary — keep as-is.
  if (items.length === 1 && items[0].summary === fallbackSummary.trim()) {
    return fallbackSummary;
  }

  const header = `${policyName} has ${items.length} regulation gap(s) requiring CCO review.`;
  const body = items
    .map((gap, index) =>
      gap.rule ? `${index + 1}. (${gap.rule}) ${gap.summary}` : `${index + 1}. ${gap.summary}`
    )
    .join("\n\n");

  return `${header}\n\n${body}`;
}
