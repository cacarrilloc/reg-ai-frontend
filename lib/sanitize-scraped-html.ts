const PREVIEW_STYLE = [
  "html,body{margin:0;overflow:visible!important;background:#fff;color:#141414;}",
  'body{font-family:Georgia,"Times New Roman",serif;padding:1.5rem 2rem 3rem;line-height:1.45;}',
  "h1{font-size:2rem;font-weight:650;letter-spacing:-.02em;margin:0 0 .4rem;}",
  "h2{font-size:1.35rem;font-weight:650;margin:1.75rem 0 .45rem;}",
  "h3{font-size:1.1rem;font-weight:600;margin:1.1rem 0 .3rem;}",
  "article{max-width:42rem;}",
  "p,li{font-size:.95rem;margin:.35rem 0 .7rem;}",
  "img,picture,video,canvas,svg,object{max-width:80px!important;max-height:80px!important;",
  "width:auto!important;height:auto!important;object-fit:contain;display:inline-block;",
  "vertical-align:middle;}",
  "nav,app-header,.header-navigation{display:none!important;}",
  "a{pointer-events:none;color:#141414;}",
  "a.pvd-button-root,.pvd-button__text{display:inline-block;border:1px solid #141414;",
  "border-radius:4px;padding:.4rem .75rem;margin:.25rem .35rem .25rem 0;",
  "font-size:.9rem;text-decoration:none;}",
  "[data-reg-marker]{display:inline-flex;align-items:center;justify-content:center;",
  "min-width:1.35rem;height:1.35rem;margin:0 0 0 .4rem;padding:0 .35rem;border-radius:999px;",
  "background:#dc2626;color:#fff;font:600 10px/1 system-ui,sans-serif;vertical-align:middle;}",
].join("");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isJsUrl(value: string): boolean {
  return /^\s*javascript:/i.test(value);
}

function shrinkPreviewMedia(doc: Document): void {
  doc.querySelectorAll("img, picture, video, canvas, svg, object").forEach((el) => {
    el.removeAttribute("width");
    el.removeAttribute("height");
    const style = el.getAttribute("style");
    if (!style) return;
    const next = style
      .replace(/(?:^|;)\s*(?:min-|max-)?(?:width|height)\s*:[^;]*/gi, "")
      .replace(/^;+|;+$/g, "")
      .trim();
    if (next) el.setAttribute("style", next);
    else el.removeAttribute("style");
  });
}

/** Strip active content and site CSS so the iframe shows the scraped copy. */
export function sanitizeScrapedHtml(
  raw: string,
  sourceUrl?: string | null,
  options?: { preferArticle?: boolean },
): string {
  const html = (raw || "").trim();
  if (!html || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script, noscript, iframe, object, embed, template, style, link")
    .forEach((node) => node.remove());
  doc.querySelectorAll("meta[http-equiv]").forEach((meta) => {
    if ((meta.getAttribute("http-equiv") || "").toLowerCase() === "refresh") meta.remove();
  });
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value || "";
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (
        (name === "href" || name === "src" || name === "action" || name === "xlink:href") &&
        isJsUrl(value)
      ) {
        el.removeAttribute(attr.name);
      } else if (name === "srcset" && value.toLowerCase().includes("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
  });
  shrinkPreviewMedia(doc);
  const articles = [...doc.querySelectorAll("article")];
  const longestArticle = articles.sort(
    (left, right) => (right.textContent || "").length - (left.textContent || "").length,
  )[0];
  const root = options?.preferArticle
    ? longestArticle || doc.querySelector("main, [role='main']")
    : doc.querySelector("main, [role='main'], article");
  if (root && doc.body && root !== doc.body) {
    const footer = options?.preferArticle ? null : doc.querySelector("footer");
    doc.body.replaceChildren(root);
    if (footer && !root.contains(footer)) doc.body.append(footer);
  }
  if (sourceUrl) {
    doc.querySelectorAll("base").forEach((node) => node.remove());
    const base = doc.createElement("base");
    base.setAttribute("href", sourceUrl);
    doc.head.prepend(base);
  }
  const style = doc.createElement("style");
  style.setAttribute("data-scraped-preview", "true");
  style.textContent = PREVIEW_STYLE;
  doc.head.append(style);
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

export function scrapedHtmlHasVisibleCopy(
  html: string | null | undefined,
  sourceUrl?: string | null,
  options?: { preferArticle?: boolean },
): boolean {
  if (!html || html.trim().length < 40) return false;
  const sanitized = sanitizeScrapedHtml(html, sourceUrl, options);
  if (/<h[1-3][\s>]/i.test(sanitized)) return true;
  const text = sanitized
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 200 && !text.includes("{");
}

/** Build a same-origin HTML page from extracted scrape text when no snapshot exists. */
export function buildHtmlFromScrapedCopy(text: string, sourceUrl?: string | null): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Full (?:page|article) text$/i.test(line))
    .filter((line) => !/^Footer\s+[—-]/i.test(line));
  const parts: string[] = [];
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      parts.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }
    const cta = /^\[(.+)\]$/.exec(line);
    if (cta && cta[1].trim().length >= 8) {
      parts.push(`<p><span class="pvd-button__text">${escapeHtml(cta[1])}</span></p>`);
      continue;
    }
    if (/^(Hero|Badges|Testimonials|Mid page|Page title)\b/i.test(line) && line.length < 48) {
      continue;
    }
    const looksHeading =
      line.length >= 8 &&
      line.length <= 80 &&
      !/[.!?]$/.test(line) &&
      !/©|copyright|all rights reserved|privacy|terms of/i.test(line);
    if (looksHeading) {
      parts.push(`<h3>${escapeHtml(line)}</h3>`);
      continue;
    }
    parts.push(`<p>${escapeHtml(line)}</p>`);
  }
  if (!parts.length) return "";
  return sanitizeScrapedHtml(`<!DOCTYPE html><html><body><main>${parts.join("\n")}</main></body></html>`, sourceUrl);
}
