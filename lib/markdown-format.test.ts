import { describe, expect, it } from "vitest";
import { formatGapSummaryAsMarkdown, normalizeMarkdownLists } from "./markdown-format";

describe("normalizeMarkdownLists", () => {
  it("converts inline bullets into markdown list items", () => {
    const input = "Key gaps include: • Supervision updates • Recordkeeping controls.";

    const output = normalizeMarkdownLists(input);

    expect(output).toContain("\n- Supervision updates");
    expect(output).toContain("\n- Recordkeeping controls.");
  });

  it("inserts blank lines before list blocks", () => {
    const input = "Multiple considerations:\n- First item\n- Second item";

    const output = normalizeMarkdownLists(input);

    expect(output).toContain("Multiple considerations:\n\n- First item");
  });

  it("normalizes numbered action lists", () => {
    const input = "Next steps: 1. Update policy. 2. Train staff.";

    const output = normalizeMarkdownLists(input);

    expect(output).toContain("\n1. Update policy.");
    expect(output).toContain("\n2. Train staff.");
  });
});

describe("formatGapSummaryAsMarkdown", () => {
  it("delegates to normalizeMarkdownLists", () => {
    const input = "Findings: • Missing supervision language.";

    expect(formatGapSummaryAsMarkdown(input)).toBe(normalizeMarkdownLists(input));
  });
});
