/** Canonical gap trigger values stored on gap_analyses.trigger_type. */
export type GapTriggerType = "publication" | "business_change" | "policy_update" | string;

/**
 * Display label for a gap's trigger_type.
 * Shared by Pending Approvals, Compliance History, Gap Analyses, Review Queue, and Audit Trail.
 * publication and policy_update both surface as Policy Update.
 */
export function gapTriggerLabel(triggerType: GapTriggerType | null | undefined): string {
  if (triggerType === "business_change") return "Business Change";
  if (triggerType === "marketing_content") return "Marketing Review";
  return "Policy Update";
}

export function isBusinessChangeTrigger(
  triggerType: GapTriggerType | null | undefined
): boolean {
  return triggerType === "business_change";
}

export function isMarketingContentTrigger(
  triggerType: GapTriggerType | null | undefined
): boolean {
  return triggerType === "marketing_content";
}

const MARKETING_FORMAT_LABELS: Record<string, string> = {
  social: "Social post",
  email: "Email",
  webpage: "Homepage",
  presentation: "Presentation/deck",
  blog: "Article/Blog",
  text: "Other text",
  image: "Other text",
  other: "Other text"
};

export function marketingFormatLabel(format: string | null | undefined): string {
  const key = (format || "").trim().toLowerCase();
  return MARKETING_FORMAT_LABELS[key] || "";
}

const MARKETING_RULE_ID_RE = /(SEC|FINRA):\s*Rules?\s*[0-9().]+(?:\s*[–-]\s*[0-9]+)?/gi;

export function marketingRuleDisplayLabels(
  labels: string[] | undefined,
  policyName: string
): string[] {
  const blob = [...(labels || []), policyName].join("\n");
  const matches = blob.match(MARKETING_RULE_ID_RE);
  if (matches?.length) {
    return [...new Set(matches.map((item) => item.replace(/\s+/g, " ").trim()))];
  }
  return (labels?.length ? labels : policyName.split("\n"))
    .map((item) =>
      item
        .replace(/,\s*the Marketing Rule/gi, "")
        .replace(/\bthe Marketing Rule\b/gi, "")
        .replace(/,\s*recordkeeping/gi, "")
        .replace(/,\s*communications with the public/gi, "")
        .replace(/[,\s]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}
