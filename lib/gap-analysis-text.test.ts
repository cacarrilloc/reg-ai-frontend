import { describe, expect, it } from "vitest";
import {
  formatAddedContent,
  formatAddedContentLabel,
  formatGovRegulationFrameworkLabel,
  formatAuditTrailGapSummary,
  formatBusinessChangeType,
  formatCosineSimilarity,
  isInformationalImpact,
  normalizeImpactScore,
  sortAnalysesByImpact,
  truncateWords
} from "@/lib/gap-analysis-text";

describe("normalizeImpactScore", () => {
  it("maps legacy NONE values to INFO", () => {
    expect(normalizeImpactScore("NONE")).toBe("INFO");
    expect(normalizeImpactScore("info")).toBe("INFO");
  });
});

describe("formatBusinessChangeType", () => {
  it("maps known business change types to display labels", () => {
    expect(formatBusinessChangeType("NEW_PRODUCT")).toBe("New product");
    expect(formatBusinessChangeType("new_process")).toBe("New process");
    expect(formatBusinessChangeType("NEW_HIRE")).toBe("New hire");
    expect(formatBusinessChangeType("NEW_MARKET")).toBe("New market");
  });

  it("returns null for empty values", () => {
    expect(formatBusinessChangeType(null)).toBeNull();
    expect(formatBusinessChangeType("")).toBeNull();
  });
});

describe("formatCosineSimilarity", () => {
  it("formats similarity as a percentage", () => {
    expect(formatCosineSimilarity(0.8123)).toBe("81.2%");
    expect(formatCosineSimilarity(null)).toBeNull();
  });
});

describe("formatAddedContent", () => {
  it("is 100 minus the displayed cosine percentage", () => {
    expect(formatAddedContent(0.371)).toBe("62.9%");
    expect(formatAddedContent(0.636)).toBe("36.4%");
    expect(formatAddedContent(null)).toBeNull();
  });
});

describe("formatAddedContentLabel", () => {
  it("prefixes the percent for table rows", () => {
    expect(formatAddedContentLabel(0.371)).toBe("Added Content: 62.9%");
    expect(formatAddedContentLabel(null)).toBeNull();
  });
});

describe("formatGovRegulationFrameworkLabel", () => {
  it("is 100 minus the displayed cosine percentage", () => {
    expect(formatGovRegulationFrameworkLabel(0.371)).toBe(
      "Content added from Gov. Regulation Framework: 62.9%"
    );
    expect(formatGovRegulationFrameworkLabel(null)).toBeNull();
  });
});

describe("truncateWords", () => {
  it("returns the full text when under the word limit", () => {
    expect(truncateWords("One two three", 100)).toEqual({
      preview: "One two three",
      truncated: false
    });
  });

  it("truncates long summaries with an ellipsis", () => {
    const words = Array.from({ length: 120 }, (_, index) => `word${index}`).join(" ");
    const result = truncateWords(words, 100);

    expect(result.truncated).toBe(true);
    expect(result.preview.endsWith("…")).toBe(true);
    expect(result.preview.split(/\s+/).length).toBe(100);
  });
});

describe("sortAnalysesByImpact", () => {
  it("orders HIGH before MEDIUM before INFO", () => {
    const sorted = sortAnalysesByImpact([
      { id: "1", impact_score: "NONE", created_at: "2026-07-01T12:00:00Z" },
      { id: "2", impact_score: "HIGH", created_at: "2026-07-01T10:00:00Z" },
      { id: "3", impact_score: "MEDIUM", created_at: "2026-07-01T11:00:00Z" }
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["2", "3", "1"]);
  });
});

describe("isInformationalImpact", () => {
  it("treats NONE and INFO as informational", () => {
    expect(isInformationalImpact("INFO")).toBe(true);
    expect(isInformationalImpact("NONE")).toBe(true);
    expect(isInformationalImpact("HIGH")).toBe(false);
  });
});

describe("formatAuditTrailGapSummary", () => {
  it("lists every finding for the Audit Trail Gap column", () => {
    const summary = formatAuditTrailGapSummary(
      "AML Test Policy",
      [
        { summary: "No formal AMLCO designation.", rule: "FINRA Rule 3310(a)" },
        { summary: "No annual training cadence.", rule: "FINRA Rule 3310(e)" },
      ],
      "AML Test Policy has 2 regulation gap(s) requiring CCO review. First gap: No formal AMLCO designation."
    );

    expect(summary).toContain("has 2 regulation gap(s)");
    expect(summary).toContain("1. (FINRA Rule 3310(a)) No formal AMLCO designation.");
    expect(summary).toContain("2. (FINRA Rule 3310(e)) No annual training cadence.");
    expect(summary).not.toContain("First gap:");
  });

  it("falls back to the stored summary when findings are absent", () => {
    expect(formatAuditTrailGapSummary("Policy", [], "Stored first-gap summary")).toBe(
      "Stored first-gap summary"
    );
  });
});
