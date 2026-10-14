/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  articleParagraphs,
  needlesFromFinding,
  numberFindingsByDocumentOrder,
  paragraphIndexFromFinding,
  pinFindingsInDocument,
} from "./html-preview-markers";

describe("needlesFromFinding", () => {
  it("puts the FIX quoted claim first", () => {
    const needles = needlesFromFinding({
      title: "Designed to eliminate it (sequence risk)",
      excerpt: "Testimonial carousel",
      draft_text:
        "Leave paragraphs 1–5 untouched. Redline paragraph 6: “designed to eliminate it” → “The approach is designed to reduce exposure to sequence risk.”",
      region: "para_6",
    });
    expect(needles[0]?.toLowerCase()).toContain("designed to eliminate it");
  });
});

describe("paragraphIndexFromFinding", () => {
  it("reads paragraph 6 from the FIX and from para_6", () => {
    expect(
      paragraphIndexFromFinding({
        draft_text: 'Redline paragraph 6: “designed to eliminate it”',
        region: "button",
      }),
    ).toBe(6);
    expect(paragraphIndexFromFinding({ region: "para_6" })).toBe(6);
  });
});

describe("numberFindingsByDocumentOrder", () => {
  it("renumbers markers to match top-to-bottom HTML order", () => {
    const html = `
      <html>
        <body>
          <main>
            <h1>Approaching Retirement? Make Every Decision Work Together.</h1>
            <p>30 minutes. No cost. No pressure. Bring your retirement date, pension or Social Security question, or portfolio concern.</p>
            <p>Fee-Only Fiduciary | $350M+ Assets Under Management | 330+ Households | 50+ Google Reviews</p>
          </main>
        </body>
      </html>
    `;
    const findings = [
      {
        id: "fiduciary_claim",
        marker: 1,
        region: "hero",
        excerpt: "Approaching Retirement? Make Every Decision Work Together.",
      },
      {
        id: "third_party_rating",
        marker: 2,
        region: "badge_row",
        excerpt: "50+ Google Reviews",
      },
      {
        id: "testimonial",
        marker: 3,
        region: "testimonial",
        excerpt:
          "Bring your retirement date, pension or Social Security question, or portfolio concern.",
      },
    ];

    const doc = new DOMParser().parseFromString(html, "text/html");
    const ordered = pinFindingsInDocument(doc, findings);

    expect(ordered.map((item) => item.id)).toEqual([
      "fiduciary_claim",
      "testimonial",
      "third_party_rating",
    ]);
    expect(ordered.map((item) => item.marker)).toEqual([1, 2, 3]);
    expect([...doc.querySelectorAll("[data-reg-marker]")].map((node) => node.textContent)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(numberFindingsByDocumentOrder(html, findings).map((item) => item.id)).toEqual([
      "fiduciary_claim",
      "testimonial",
      "third_party_rating",
    ]);
  });
});

describe("articleParagraphs", () => {
  it("skips social link rows", () => {
    document.body.innerHTML = `
      <article>
        <p>One educational paragraph about sequence of returns risk and retirement income.</p>
        <p>Two educational paragraph about sequence of returns risk and retirement income.</p>
        <p class="social-share"><a href="https://facebook.com">Facebook</a></p>
      </article>
    `;
    const paras = articleParagraphs(document.body);
    expect(paras).toHaveLength(2);
    expect(paras.some((el) => /Facebook/.test(el.textContent || ""))).toBe(false);
  });
});
