import { describe, expect, it } from "vitest";
import {
  PRODUCT_SHARE_SENTENCES,
  PRODUCT_SHARE_URL,
  productShareMessage,
  productShareText,
} from "@/lib/product-share";
import {
  facebookShareUrl,
  gmailComposeUrl,
  linkedInComposeUrl,
  xShareUrl,
} from "@/lib/publication-share";

describe("product share copy", () => {
  it("is three invite sentences plus the public product URL", () => {
    expect(PRODUCT_SHARE_SENTENCES).toHaveLength(3);
    expect(PRODUCT_SHARE_URL).toBe("https://reg-ai.ipxenterprises.com");
    const text = productShareText();
    for (const sentence of PRODUCT_SHARE_SENTENCES) {
      expect(text).toContain(sentence);
    }
    expect(text).toContain(PRODUCT_SHARE_URL);
  });

  it("puts the invite and product URL on LinkedIn compose, X, and Facebook share links", () => {
    const message = productShareMessage();
    const text = productShareText();
    const linkedIn = new URL(linkedInComposeUrl(text));
    expect(linkedIn.pathname).toBe("/feed/");
    expect(linkedIn.searchParams.get("shareActive")).toBe("true");
    expect(linkedIn.searchParams.get("text")).toBe(text);
    const x = new URL(xShareUrl(PRODUCT_SHARE_URL, message));
    expect(x.searchParams.get("text")).toBe(message);
    expect(x.searchParams.get("url")).toBe(PRODUCT_SHARE_URL);
    const facebook = new URL(facebookShareUrl(PRODUCT_SHARE_URL));
    expect(facebook.searchParams.get("u")).toBe(PRODUCT_SHARE_URL);
    const gmail = new URL(gmailComposeUrl("Try Reg AI Rule Change Tracker", text));
    expect(gmail.hostname).toBe("mail.google.com");
    expect(gmail.searchParams.get("view")).toBe("cm");
    expect(gmail.searchParams.get("su")).toBe("Try Reg AI Rule Change Tracker");
    expect(gmail.searchParams.get("body")).toBe(text);
  });
});
