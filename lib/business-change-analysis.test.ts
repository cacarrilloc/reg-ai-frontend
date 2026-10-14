import { describe, expect, it } from "vitest";
import { canRetryAnalysis, isAnalysisInProgress } from "@/lib/business-change-analysis";

describe("business change analysis status", () => {
  it("treats pending and generating as in progress", () => {
    expect(isAnalysisInProgress("PENDING")).toBe(true);
    expect(isAnalysisInProgress("GENERATING")).toBe(true);
    expect(isAnalysisInProgress("READY")).toBe(false);
    expect(isAnalysisInProgress("FAILED")).toBe(false);
  });

  it("lets history retry until a gap exists, even if the DOCX is already ready", () => {
    expect(canRetryAnalysis("GENERATING")).toBe(true);
    expect(canRetryAnalysis("FAILED")).toBe(true);
    expect(canRetryAnalysis("READY", null)).toBe(true);
    expect(canRetryAnalysis("READY", "gap-1")).toBe(false);
  });
});
