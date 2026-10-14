import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth-redirect";

describe("safeNextPath", () => {
  it("keeps relative join paths with query params", () => {
    expect(safeNextPath("/join?token=abc")).toBe("/join?token=abc");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("\\evil")).toBe("/dashboard");
  });

  it("falls back when missing", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(undefined, "/organizations")).toBe("/organizations");
  });
});
