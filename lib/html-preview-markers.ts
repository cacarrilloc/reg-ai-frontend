export type MarkerFinding = {
  id?: string;
  marker?: number;
  excerpt?: string;
  title?: string;
  draft_text?: string;
  region?: string;
};

type LayoutExcerpt = {
  region?: string;
  excerpt?: string;
};

function normalizeCopy(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\[(.+)\]$/gm, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotes(text: string): string[] {
  return [...text.matchAll(/"([^"]{8,160})"/g)].map((match) => normalizeCopy(match[1]));
}

function extractArrowLeft(text: string): string[] {
  const normalized = text.replace(/[“”]/g, '"');
  const match = /"([^"]{8,160})"\s*(?:->|→|⇒|=>)/.exec(normalized);
  return match ? [normalizeCopy(match[1])] : [];
}

/** Phrases to search in the HTML. FIX original quotes first, then longer excerpts. */
export function needlesFromFinding(finding: MarkerFinding, regionExcerpt = ""): string[] {
  const draft = normalizeCopy(finding.draft_text || "");
  const preferred = extractArrowLeft(finding.draft_text || "");
  const quotes = extractQuotes(draft).filter((item) => !preferred.includes(item));
  const blobs = [finding.excerpt, regionExcerpt]
    .map((item) => normalizeCopy(item || ""))
    .filter((item) => item.length >= 12);
  const windows: string[] = [];
  for (const blob of blobs) {
    windows.push(blob.slice(0, 96));
    if (blob.length >= 24) windows.push(blob.slice(0, 36));
    const sentence = blob.split(/(?<=[.!?])\s+/)[0] || "";
    if (sentence.length >= 16) windows.push(sentence.slice(0, 80));
  }
  const rest = [...quotes, ...windows]
    .map((item) => item.trim())
    .filter((item) => item.length >= 12 && !preferred.includes(item))
    .sort((left, right) => right.length - left.length);
  return [...new Set([...preferred, ...rest])];
}

/** 1-based paragraph index from region or “Redline paragraph 6”. */
export function paragraphIndexFromFinding(finding: MarkerFinding): number | null {
  const region = (finding.region || "").toLowerCase();
  const fromRegion = /^para_(\d+)$/.exec(region);
  if (fromRegion) return Number(fromRegion[1]);
  const fromDraft = /paragraph\s+(\d+)/i.exec(finding.draft_text || "");
  if (fromDraft) return Number(fromDraft[1]);
  return null;
}

export function isWeakMarkerHost(el: Element): boolean {
  const meta = `${el.getAttribute("class") || ""} ${el.getAttribute("id") || ""} ${el.getAttribute("aria-label") || ""}`;
  if (/social|share|follow|facebook|linkedin|twitter|instagram|youtube/i.test(meta)) return true;
  if (el.closest("nav, aside, footer, [class*='social'], [class*='share']")) return true;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  const links = el.querySelectorAll("a").length;
  return links >= 2 && text.length < 96;
}

export function articleParagraphs(root: ParentNode): Element[] {
  return [...root.querySelectorAll("p, li, h1, h2, h3, blockquote")].filter((el) => {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return text.length >= 24 && !isWeakMarkerHost(el);
  });
}

function findingKey(finding: MarkerFinding, index: number): string {
  return String(finding.id || finding.marker || index);
}

function makeHtmlMarker(doc: Document, key: string): HTMLElement {
  const marker = doc.createElement("span");
  marker.setAttribute("data-reg-finding", key);
  marker.setAttribute("data-reg-marker", key);
  marker.textContent = key;
  return marker;
}

function placeMarkerOnElement(el: Element, key: string): boolean {
  if (!el.ownerDocument) return false;
  el.append(makeHtmlMarker(el.ownerDocument, key));
  return true;
}

function placeMarkerAtNeedle(doc: Document, needle: string, key: string): boolean {
  const haystack = needle.trim().toLowerCase();
  if (haystack.length < 12 || !doc.body) return false;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (!parent || parent.closest("[data-reg-marker]")) {
      node = walker.nextNode();
      continue;
    }
    if (parent.closest("nav, aside, footer, [class*='social'], [class*='share']")) {
      node = walker.nextNode();
      continue;
    }
    const text = node.textContent || "";
    const index = text.toLowerCase().indexOf(haystack);
    if (index >= 0) {
      const range = doc.createRange();
      range.setStart(node, index + haystack.length);
      range.collapse(true);
      range.insertNode(makeHtmlMarker(doc, key));
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function placeMarkerOnParagraph(doc: Document, index: number, key: string): boolean {
  const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
  if (!root) return false;
  const paras = articleParagraphs(root);
  const target = paras[index - 1];
  return target ? placeMarkerOnElement(target, key) : false;
}

function placeMarkerByOverlap(doc: Document, finding: MarkerFinding, key: string): boolean {
  const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
  if (!root) return false;
  const hay = `${finding.excerpt || ""} ${finding.draft_text || ""}`.toLowerCase();
  let best: { el: Element; score: number } | null = null;
  for (const el of articleParagraphs(root)) {
    const words = (el.textContent || "").toLowerCase().split(/\W+/).filter((word) => word.length >= 5);
    const score = words.filter((word) => hay.includes(word)).length;
    if (score >= 2 && (!best || score > best.score)) best = { el, score };
  }
  return best ? placeMarkerOnElement(best.el, key) : false;
}

function regionExcerptFor(finding: MarkerFinding, notes: LayoutExcerpt[]): string {
  return (
    notes.find((note) => (note.region || "").toLowerCase() === (finding.region || "").toLowerCase())?.excerpt ||
    ""
  );
}

/**
 * Pin findings on the snapshot, then number 1..n in document order so the
 * red dots match the gap-review list.
 */
export function pinFindingsInDocument<T extends MarkerFinding>(
  doc: Document,
  findings: T[],
  notes: LayoutExcerpt[] = [],
): T[] {
  doc.querySelectorAll("[data-reg-marker]").forEach((node) => node.remove());
  const placedKeys: string[] = [];
  for (const [index, finding] of findings.entries()) {
    const key = findingKey(finding, index);
    const regionExcerpt = regionExcerptFor(finding, notes);
    let placed = false;
    for (const needle of needlesFromFinding(finding, regionExcerpt)) {
      if (placeMarkerAtNeedle(doc, needle, key)) {
        placed = true;
        break;
      }
    }
    const paraIndex = paragraphIndexFromFinding(finding);
    if (!placed && paraIndex) {
      placed = placeMarkerOnParagraph(doc, paraIndex, key);
    }
    if (!placed) {
      placed = placeMarkerByOverlap(doc, finding, key);
    }
    if (!placed) {
      const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      const paras = root ? articleParagraphs(root) : [];
      if (paras.length) placed = placeMarkerOnElement(paras[Math.min(paras.length - 1, 5)], key);
    }
    if (placed) placedKeys.push(key);
  }

  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll("[data-reg-finding]").forEach((node) => {
    const key = node.getAttribute("data-reg-finding") || "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    orderedKeys.push(key);
  });
  for (const key of placedKeys) {
    if (!seen.has(key)) {
      seen.add(key);
      orderedKeys.push(key);
    }
  }

  const byKey = new Map(findings.map((finding, index) => [findingKey(finding, index), finding]));
  const leftover = findings.filter((finding, index) => !seen.has(findingKey(finding, index)));
  const ordered = [
    ...orderedKeys.map((key) => byKey.get(key)).filter((item): item is T => Boolean(item)),
    ...leftover,
  ];
  const numbered = ordered.map((finding, index) => ({ ...finding, marker: index + 1 }));
  orderedKeys.forEach((key, index) => {
    const marker = String(index + 1);
    doc.querySelectorAll("[data-reg-finding]").forEach((node) => {
      if (node.getAttribute("data-reg-finding") !== key) return;
      node.setAttribute("data-reg-marker", marker);
      node.textContent = marker;
    });
  });
  return numbered;
}

export function numberFindingsByDocumentOrder<T extends MarkerFinding>(
  html: string,
  findings: T[],
  notes: LayoutExcerpt[] = [],
): T[] {
  if (!findings.length || typeof DOMParser === "undefined") return findings;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return pinFindingsInDocument(doc, findings, notes);
}
