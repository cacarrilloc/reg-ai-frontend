/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { buildHtmlFromScrapedCopy, sanitizeScrapedHtml, scrapedHtmlHasVisibleCopy } from "./sanitize-scraped-html";

describe("sanitizeScrapedHtml", () => {
  it("keeps headings and styles while stripping scripts and handlers", () => {
    const html = `
      <html>
        <head>
          <script>alert(1)</script>
          <style>.hero { font-size: 48px; }</style>
          <link rel="stylesheet" href="/app.css">
          <link rel="preload" as="script" href="/boot.js">
        </head>
        <body>
          <h1 onclick="alert(1)">Invest today and plan for tomorrow</h1>
          <a href="javascript:alert(1)">Open a brokerage account</a>
          <p>Keep your money working toward your goals.</p>
        </body>
      </html>
    `;

    const rendered = sanitizeScrapedHtml(html, "https://www.fidelity.com/");

    expect(rendered.toLowerCase()).not.toContain("<script");
    expect(rendered.toLowerCase()).not.toContain("onclick");
    expect(rendered.toLowerCase()).not.toContain("javascript:");
    expect(rendered).not.toContain("boot.js");
    expect(rendered).not.toContain("/app.css");
    expect(rendered).toContain("Invest today and plan for tomorrow");
    expect(rendered).toContain("Keep your money working toward your goals.");
    expect(rendered).toContain("<h1");
    expect(rendered).toContain("https://www.fidelity.com/");
    expect(scrapedHtmlHasVisibleCopy(html, "https://www.fidelity.com/")).toBe(true);
  });

  it("rejects script-only previews that have no visible copy", () => {
    expect(scrapedHtmlHasVisibleCopy("<html><script>var x=1</script></html>")).toBe(false);
  });

  it("keeps an article body for blog snapshots", () => {
    const html = `
      <html>
        <body>
          <main>
            <p>Global marketing chrome that is not the article.</p>
            <article>
              <h1>4 Tools to Manage Key Business Transactions Remotely</h1>
              <p>Explore all blogs</p>
            </article>
            <article>
              <h1>Why Sequence-of-Returns Risk Is the Retirement Killer</h1>
              <p>Sequence-of-returns risk is why the order of market returns can matter more than the average.</p>
              <p>This is exactly why we built the Meridian Income Ladder for retirement income.</p>
            </article>
          </main>
        </body>
      </html>
    `;
    const rendered = sanitizeScrapedHtml(html, "https://meridian.example/insights/sequence-risk", {
      preferArticle: true,
    });
    expect(rendered).toContain("Why Sequence-of-Returns Risk");
    expect(rendered).not.toContain("Global marketing chrome");
    expect(rendered).not.toContain("4 Tools to Manage");
    expect(scrapedHtmlHasVisibleCopy(html, null, { preferArticle: true })).toBe(true);
  });

  it("caps icons and images to thumbnails", () => {
    const html = `
      <html>
        <body>
          <h1>Fortress Financial Group</h1>
          <svg width="100%" height="400" viewBox="0 0 24 24" style="width:100%;height:400px">
            <path d="M8 5v14l11-7z"></path>
          </svg>
          <img src="/instagram.svg" width="1200" height="1200" alt="Instagram" />
        </body>
      </html>
    `;

    const rendered = sanitizeScrapedHtml(html, "https://fortressfg.net/");

    expect(rendered).toContain("max-width:80px");
    expect(rendered).toContain("max-height:80px");
    expect(rendered).not.toMatch(/<(?:svg|img)[^>]+\bwidth=/i);
    expect(rendered).not.toMatch(/<(?:svg|img)[^>]+\bheight=/i);
    expect(rendered).not.toMatch(/style="[^"]*(?:width|height)\s*:/i);
  });

  it("rejects a truncated head-only snapshot", () => {
    const html = `<html><head><title>Fidelity Investments - Retirement Plans</title>
      <style>.off-screen{position:absolute}</style></head><body></body></html>`;
    expect(scrapedHtmlHasVisibleCopy(html)).toBe(false);
  });
});

describe("buildHtmlFromScrapedCopy", () => {
  it("turns tagged scrape text into headings and buttons", () => {
    const html = buildHtmlFromScrapedCopy(
      "# Invest today and plan for tomorrow\n\nWe can help you get started.\n\n## Start investing\n\n### $0 account fees\n\nKeep your money working toward your goals.\n\n[Open a brokerage account]",
      "https://www.fidelity.com/",
    );
    expect(html).toContain("<h1>");
    expect(html).toContain("Invest today and plan for tomorrow");
    expect(html).toContain("<h2>");
    expect(html).toContain("$0 account fees");
    expect(html).toContain("pvd-button__text");
    expect(html).toContain("Open a brokerage account");
    expect(scrapedHtmlHasVisibleCopy(html)).toBe(true);
  });
});
