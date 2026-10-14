const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function linkedInShareUrl(articleUrl: string, summary?: string): string {
  if (summary) {
    const params = new URLSearchParams({
      mini: "true",
      url: articleUrl,
      summary,
    });
    return `https://www.linkedin.com/shareArticle?${params.toString()}`;
  }
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`;
}

/** Prefills LinkedIn's compose box. shareArticle/summary is ignored by LinkedIn. */
export function linkedInComposeUrl(text: string): string {
  const params = new URLSearchParams({
    shareActive: "true",
    text,
  });
  return `https://www.linkedin.com/feed/?${params.toString()}`;
}

export function xShareUrl(articleUrl: string, title: string): string {
  const params = new URLSearchParams({
    text: title,
    url: articleUrl,
  });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function facebookShareUrl(articleUrl: string, quote?: string): string {
  const params = new URLSearchParams({ u: articleUrl });
  if (quote) {
    params.set("quote", quote);
  }
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}

export function emailShareUrl(
  articleUrl: string,
  title: string,
  address?: string,
  body?: string
): string {
  const recipient = (address || "").trim();
  const subject = encodeURIComponent(title);
  const text = encodeURIComponent(body ?? `${title}\n\n${articleUrl}`);
  return `mailto:${recipient}?subject=${subject}&body=${text}`;
}

/** Opens Gmail compose with subject and body. mailto is left for address-specific sends. */
export function gmailComposeUrl(subject: string, body: string, to?: string): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    su: subject,
    body,
  });
  const recipient = (to || "").trim();
  if (recipient) {
    params.set("to", recipient);
  }
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function isShareEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}
