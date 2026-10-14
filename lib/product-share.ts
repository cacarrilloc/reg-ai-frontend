export const PRODUCT_SHARE_URL = "https://reg-ai.ipxenterprises.com";

export const PRODUCT_SHARE_SENTENCES = [
  "Reg AI tracks FINRA, SEC, and CFTC rule changes against your policies, business changes, and marketing content.",
  "Agents draft gap analyses and tracked redlines for CCO sign-off, with an exam-ready audit trail.",
  "Try the Rule Change Tracker with your compliance team today.",
] as const;

export function productShareMessage(): string {
  return PRODUCT_SHARE_SENTENCES.join(" ");
}

/** Three invite sentences plus the public product URL. */
export function productShareText(): string {
  return `${productShareMessage()}\n\n${PRODUCT_SHARE_URL}`;
}
