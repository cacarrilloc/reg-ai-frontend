import { describe, expect, it } from "vitest";
import { marketingRuleDisplayLabels } from "@/lib/gap-trigger";

describe("marketingRuleDisplayLabels", () => {
  it("keeps the same SEC and FINRA labels shown in Affected Rules", () => {
    expect(
      marketingRuleDisplayLabels(
        [
          "SEC: Rule 206(4)-1",
          "SEC: Rule 204-2",
          "FINRA: Rule 2210",
          "FINRA: Rules 2211–2216",
        ],
        ""
      )
    ).toEqual([
      "SEC: Rule 206(4)-1",
      "SEC: Rule 204-2",
      "FINRA: Rule 2210",
      "FINRA: Rules 2211–2216",
    ]);
  });
});
