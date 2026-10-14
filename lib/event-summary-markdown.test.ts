import { describe, expect, it } from "vitest";
import { formatEventSummaryAsMarkdown } from "./event-summary-markdown";

describe("formatEventSummaryAsMarkdown", () => {
  it("breaks dense summaries into markdown sections and lists", () => {
    const input =
      "**Business Change:** New hire. **Compliance Impact:** Multiple considerations: • **AI:** Uses models. • **Supervision:** Needs review. **Recommended Actions:** 1. Update policy. 2. Review controls.";

    const output = formatEventSummaryAsMarkdown(input);

    expect(output).toContain("**Business Change:**");
    expect(output).toContain("**Compliance Impact:**");
    expect(output).toContain("\n- **AI:**");
    expect(output).toContain("\n- **Supervision:**");
    expect(output).toContain("\n1. Update policy.");
    expect(output).toContain("\n2. Review controls.");
  });

  it("inserts blank lines before list blocks", () => {
    const input =
      "**Compliance Impact:** Multiple considerations:\n- **AI:** Uses models.\n- **Supervision:** Needs review.";

    const output = formatEventSummaryAsMarkdown(input);

    expect(output).toContain("Multiple considerations:\n\n- **AI:**");
  });

  it("normalizes line-start bullet characters", () => {
    const input = "**Compliance Impact:**\n• First item\n• Second item";

    const output = formatEventSummaryAsMarkdown(input);

    expect(output).toContain("- First item");
    expect(output).toContain("- Second item");
  });

  it("preserves already structured markdown summaries", () => {
    const input = `**Business Change:** Launching a managed account product.

**Compliance Impact:** This may affect supervision and suitability.

- **Supervision:** New oversight requirements.
- **Suitability:** Updated client profiling.

**Recommended Actions:**

1. Update the WSP.
2. Train registered representatives.`;

    const output = formatEventSummaryAsMarkdown(input);

    expect(output).toContain("- **Supervision:**");
    expect(output).toContain("1. Update the WSP.");
    expect(output).toContain("2. Train registered representatives.");
  });
});
