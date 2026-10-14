import { describe, expect, it } from "vitest";
import {
  emailShareUrl,
  facebookShareUrl,
  gmailComposeUrl,
  isShareEmailAddress,
  linkedInShareUrl,
  xShareUrl,
} from "@/lib/publication-share";

const ARTICLE = "https://www.sec.gov/news/press-release/example";
const TITLE = "SEC adopts marketing rule";

describe("publication share links", () => {
  it("builds LinkedIn, X, Facebook, and email share URLs", () => {
    expect(linkedInShareUrl(ARTICLE)).toContain(encodeURIComponent(ARTICLE));
    expect(xShareUrl(ARTICLE, TITLE)).toContain("twitter.com/intent/tweet");
    expect(xShareUrl(ARTICLE, TITLE)).toContain(encodeURIComponent(ARTICLE));
    expect(facebookShareUrl(ARTICLE)).toContain(encodeURIComponent(ARTICLE));
    expect(facebookShareUrl(ARTICLE, TITLE)).toContain("quote=");
    expect(linkedInShareUrl(ARTICLE, TITLE)).toContain("shareArticle");
    expect(emailShareUrl(ARTICLE, TITLE, "cco@firm.com")).toMatch(
      /^mailto:cco@firm\.com\?subject=/
    );
    expect(decodeURIComponent(emailShareUrl(ARTICLE, TITLE))).toContain(ARTICLE);
    expect(decodeURIComponent(emailShareUrl(ARTICLE, TITLE, undefined, "Custom body"))).toContain(
      "Custom body"
    );
    const gmail = new URL(gmailComposeUrl(TITLE, "Custom body", "cco@firm.com"));
    expect(gmail.hostname).toBe("mail.google.com");
    expect(gmail.searchParams.get("su")).toBe(TITLE);
    expect(gmail.searchParams.get("body")).toBe("Custom body");
    expect(gmail.searchParams.get("to")).toBe("cco@firm.com");
  });

  it("accepts a recipient email address", () => {
    expect(isShareEmailAddress("cco@firm.com")).toBe(true);
    expect(isShareEmailAddress("not-an-email")).toBe(false);
  });
});
