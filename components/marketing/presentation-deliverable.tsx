"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { numberFindingsByDocumentOrder, pinFindingsInDocument } from "@/lib/html-preview-markers";
import {
  buildHtmlFromScrapedCopy,
  sanitizeScrapedHtml,
  scrapedHtmlHasVisibleCopy,
} from "@/lib/sanitize-scraped-html";

const WRAP_TEXT = "min-w-0 max-w-full break-words [overflow-wrap:anywhere]";
const TOPIC_RULES = new Set(["2211", "2212", "2213", "2214", "2215", "2216"]);

export type PresentationFinding = {
  id?: string;
  marker?: number;
  title?: string;
  excerpt?: string;
  rule?: string;
  why?: string;
  confidence?: string;
  options?: string[];
  option_labels?: Record<string, string>;
  recommended_option?: string;
  status?: string;
  draft_text?: string;
  region?: string;
  slide?: number;
  anchor?: string;
  part?: string;
  marker_x?: number;
  marker_y?: number;
};

export type PresentationLayoutNote = {
  region?: string;
  font_note?: string;
  excerpt?: string;
  below_fold?: boolean;
  page?: number;
  image_count?: number;
  slide_image_url?: string;
  slide_image_path?: string;
  label?: string;
};

type CosineRule = {
  rule_id?: string;
  cosine_similarity?: number;
  related?: boolean;
};

type DeliverableVariant = "presentation" | "webpage" | "blog" | "email";

type PresentationDeliverableProps = {
  name: string;
  findings: PresentationFinding[];
  layoutNotes: PresentationLayoutNote[];
  selected: Record<string, string>;
  onSelect: (findingId: string, option: string) => void;
  cosineRules?: CosineRule[];
  reviewedAt?: string;
  transcribing?: boolean;
  variant?: DeliverableVariant;
  pageUrl?: string | null;
  pageText?: string | null;
  htmlPreview?: string | null;
};

const REGION_MARKERS: Record<string, { x: number; y: number }> = {
  title: { x: 0.5, y: 0.1 },
  hero: { x: 0.78, y: 0.28 },
  badge_row: { x: 0.5, y: 0.52 },
  testimonial: { x: 0.5, y: 0.76 },
  mid_page: { x: 0.5, y: 0.62 },
  educational: { x: 0.5, y: 0.36 },
  para_6: { x: 0.72, y: 0.48 },
  para_7: { x: 0.72, y: 0.62 },
  closing: { x: 0.5, y: 0.78 },
  button: { x: 0.5, y: 0.86 },
  footer: { x: 0.5, y: 0.9 },
  disclosures: { x: 0.5, y: 0.92 },
  subject: { x: 0.92, y: 0.14 },
  body: { x: 0.92, y: 0.42 },
  email_footer: { x: 0.92, y: 0.88 },
};

function markerStyle(finding: PresentationFinding, index: number): { left: string; top: string } {
  const region = (finding.region || "").toLowerCase();
  const fallback = REGION_MARKERS[region] || { x: 0.92, y: 0.12 };
  const x = finding.marker_x ?? fallback.x;
  const y = finding.marker_y ?? Math.min(fallback.y + index * 0.12, 0.9);
  return {
    left: `${Math.min(Math.max(x * 100, 4), 96)}%`,
    top: `${Math.min(Math.max(y * 100, 4), 96)}%`,
  };
}

function MarkerOverlay({ findings }: { findings: PresentationFinding[] }) {
  return (
    <>
      {findings.map((finding, markerIndex) => (
        <span
          key={finding.id || finding.marker || markerIndex}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 drop-shadow"
          style={markerStyle(finding, markerIndex)}
        >
          <Marker value={finding.marker || markerIndex + 1} />
        </span>
      ))}
    </>
  );
}

const PAGE_COPY_ORDER = [
  "title",
  "hero",
  "badge_row",
  "testimonial",
  "educational",
  "mid_page",
  "para_6",
  "para_7",
  "closing",
  "button",
  "footer",
  "disclosures",
];

type PageSectionHeading = "Header" | "Body" | "Footer";

const SECTION_LABEL: Record<string, PageSectionHeading> = {
  title: "Header",
  hero: "Header",
  badge_row: "Body",
  testimonial: "Body",
  educational: "Body",
  mid_page: "Body",
  para_6: "Body",
  para_7: "Body",
  closing: "Body",
  button: "Body",
  footer: "Footer",
  disclosures: "Footer",
  page: "Body",
};

type PageCopyBlock = {
  heading: PageSectionHeading;
  region: string;
  excerpt: string;
};

function commentFindings(
  findings: PresentationFinding[],
  variant: DeliverableVariant = "presentation",
): PresentationFinding[] {
  return findings.filter((item) => {
    if (item.id === "sequence_flag") return false;
    if (item.status === "held") return true;
    const option = item.recommended_option || "";
    if (option === "redline" || option === "add_disclosure" || option === "pull") {
      return true;
    }
    return (variant === "blog" || variant === "email") && option === "do_nothing";
  });
}

function stripTemplateLabels(text: string): string {
  return text
    .replace(/^Footer\s+[—-]\s+[^:]+:\s*/gim, "")
    .replace(/^Button:\s*/gim, "")
    .replace(/^No disclosures anywhere on the page\.?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageSections(notes: PresentationLayoutNote[]): PresentationLayoutNote[] {
  return notes
    .filter((note) => {
      const region = note.region || "";
      if (region.startsWith("slide_or_page_")) return false;
      const excerpt = (note.excerpt || "").trim();
      if (!excerpt) return false;
      if (looksLikeBinaryDump(excerpt)) return false;
      return !/^no disclosures anywhere on the page\.?$/i.test(excerpt);
    })
    .sort((left, right) => {
      const leftRank = PAGE_COPY_ORDER.indexOf((left.region || "").toLowerCase());
      const rightRank = PAGE_COPY_ORDER.indexOf((right.region || "").toLowerCase());
      return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
    });
}

function looksLikeBinaryDump(text: string): boolean {
  const trimmed = text.trim().replace(/^\uFFFD+/g, "").trim();
  if (/^(PNG|JFIF|GIF8|RIFF|WEBP)\b/i.test(trimmed)) return true;
  if (/PNG\s*IHDR/i.test(trimmed)) return true;
  const head = text.slice(0, 1200);
  if (/\bIHDR|\bIDAT\b|\biCCP|ICC Profile|\bJFIF\b|\bsRGB\b/i.test(head)) return true;
  const replacements = (text.match(/\uFFFD/g) || []).length;
  return replacements > 8;
}

function slideCopy(notes: PresentationLayoutNote[]): string {
  return notes
    .filter((note) => String(note.region || "").startsWith("slide_or_page_"))
    .map((note) => (note.excerpt || "").trim())
    .filter((excerpt) => excerpt && !looksLikeBinaryDump(excerpt))
    .join("\n\n");
}

function scrapedPageCopy(bodyText: string | null | undefined, notes: PresentationLayoutNote[]): string {
  const raw = (bodyText || "").trim();
  if (raw && !looksLikeBinaryDump(raw)) {
    const split = raw.split(/\nFull (?:page|article) text\n/i);
    const preferred = (split[1] || split[0] || "").trim();
    return stripTemplateLabels(preferred);
  }
  const fromSections = pageSections(notes)
    .map((note) => (note.excerpt || "").trim())
    .join("\n\n");
  return fromSections || slideCopy(notes);
}

function resolveScrapedPreviewHtml({
  htmlPreview,
  pageText,
  notes,
  sourceUrl,
  preferArticle = false,
}: {
  htmlPreview?: string | null;
  pageText?: string | null;
  notes: PresentationLayoutNote[];
  sourceUrl?: string | null;
  preferArticle?: boolean;
}): string {
  const storedHtml = scrapedHtmlHasVisibleCopy(htmlPreview, sourceUrl, { preferArticle })
    ? htmlPreview
    : "";
  if (storedHtml) return storedHtml;
  return buildHtmlFromScrapedCopy(scrapedPageCopy(pageText, notes), sourceUrl);
}

function stripLeadingCopy(source: string, prefix: string): string {
  const text = source.trim();
  const lead = prefix.trim();
  if (!lead || text.length <= lead.length) return text;
  if (text.slice(0, lead.length).toLowerCase() === lead.toLowerCase()) {
    return text.slice(lead.length).replace(/^[\s:·\-—]+/, "").trim();
  }
  return text;
}

function splitDisplayParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const withBreaks = trimmed
    .replace(/\s+(\d+\.\s+[A-Z])/g, "\n\n$1")
    .replace(/\s+(Key takeaways:?)/gi, "\n\n$1\n\n");
  const chunks = withBreaks
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const paras: string[] = [];
  for (const chunk of chunks) {
    if (/^#{1,6}\s/.test(chunk) || /^\[[^\]]+\]$/.test(chunk)) {
      paras.push(chunk);
      continue;
    }
    if (chunk.length < 480) {
      paras.push(chunk);
      continue;
    }
    const sentences = chunk.split(/(?<=[.!?])\s+(?=[A-Z“"‘])/);
    let buffer = "";
    for (const sentence of sentences) {
      if (buffer && buffer.length + sentence.length > 420) {
        paras.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer.trim()) paras.push(buffer.trim());
  }
  return paras.length ? paras : [trimmed];
}

function pageCopyBlocks(
  notes: PresentationLayoutNote[],
  pageText: string | null | undefined,
  findings: PresentationFinding[],
): PageCopyBlock[] {
  const buckets: Record<PageSectionHeading, string[]> = {
    Header: [],
    Body: [],
    Footer: [],
  };
  const regionForHeading: Record<PageSectionHeading, string> = {
    Header: "title",
    Body: "page",
    Footer: "footer",
  };
  for (const note of pageSections(notes)) {
    const region = (note.region || "").toLowerCase();
    const heading = SECTION_LABEL[region] || "Body";
    buckets[heading].push((note.excerpt || "").trim());
    if (heading !== "Body") regionForHeading[heading] = region;
  }
  const copy = scrapedPageCopy(pageText, notes);
  if (copy && copy.length > buckets.Body.join("\n\n").length) {
    buckets.Body = [copy];
  }
  const header = buckets.Header.filter(Boolean).join("\n\n");
  const footer = buckets.Footer.filter(Boolean).join("\n\n");
  if (header && buckets.Body.length) {
    buckets.Body = buckets.Body.map((item) => stripLeadingCopy(item, header)).filter(Boolean);
  }
  if (footer && buckets.Body.length) {
    buckets.Body = buckets.Body.map((item) => {
      const index = item.toLowerCase().lastIndexOf(footer.toLowerCase());
      if (index >= 0 && index + footer.length >= item.length - 8) {
        return item.slice(0, index).trim();
      }
      return item;
    }).filter(Boolean);
  }
  if (!header && buckets.Body.length) {
    const first = splitDisplayParagraphs(buckets.Body.join("\n\n"))[0] || "";
    if (first && first.length <= 160) {
      buckets.Header.push(first);
      buckets.Body = [stripLeadingCopy(buckets.Body.join("\n\n"), first)];
    }
  }
  const blocks: PageCopyBlock[] = (["Header", "Body", "Footer"] as PageSectionHeading[])
    .map((heading) => ({
      heading,
      region: regionForHeading[heading],
      excerpt: buckets[heading].filter(Boolean).join("\n\n"),
    }))
    .filter((block) => block.excerpt);
  if (blocks.length) return blocks;
  return findings
    .map((finding) => {
      const region = (finding.region || "page copy").toLowerCase();
      return {
        heading: SECTION_LABEL[region] || "Body",
        region,
        excerpt: (finding.excerpt || finding.title || "").trim(),
      };
    })
    .filter((block) => block.excerpt);
}

type ScrapedLineKind = "h1" | "h2" | "h3" | "h4" | "p" | "cta";

function parseScrapedLine(
  line: string,
  section: PageSectionHeading,
  index: number,
): { kind: ScrapedLineKind; text: string } {
  const heading = /^(#{1,6})\s+(.+)$/.exec(line);
  if (heading) {
    const level = Math.min(heading[1].length, 4) as 1 | 2 | 3 | 4;
    return { kind: `h${level}`, text: heading[2].trim() };
  }
  const cta = /^\[(.+)\]$/.exec(line);
  if (cta && cta[1].trim().length >= 8) {
    return { kind: "cta", text: cta[1].trim() };
  }
  const trimmed = line.trim();
  if (
    trimmed.length >= 8 &&
    trimmed.length <= 64 &&
    /^(open a |get started|learn more|sign (in|up)|contact |book |schedule |start now)/i.test(trimmed)
  ) {
    return { kind: "cta", text: trimmed };
  }
  const looksHeading =
    trimmed.length >= 8 &&
    trimmed.length <= 80 &&
    !/[.!?]$/.test(trimmed) &&
    !/©|copyright|all rights reserved|privacy|terms of/i.test(trimmed);
  if (looksHeading) {
    if (section === "Header" || index === 0) {
      return { kind: "h1", text: trimmed };
    }
    return { kind: "h3", text: trimmed };
  }
  return { kind: "p", text: line };
}

function ScrapedCopyLines({
  text,
  heading,
}: {
  text: string;
  heading: PageSectionHeading;
}) {
  return (
    <>
      {splitDisplayParagraphs(text).map((para, paraIndex) => {
        const line = parseScrapedLine(para, heading, paraIndex);
        const key = `${heading}-p-${paraIndex}`;
        if (line.kind === "cta") {
          return (
            <p key={key} className={`mt-2 pr-10 ${WRAP_TEXT}`}>
              <span className="inline-block rounded-md border bg-muted/40 px-2.5 py-1 text-sm font-medium">
                {line.text}
              </span>
            </p>
          );
        }
        if (line.kind !== "p") {
          const size =
            line.kind === "h1"
              ? "text-xl font-semibold tracking-tight"
              : line.kind === "h2"
                ? "text-lg font-semibold"
                : line.kind === "h3"
                  ? "text-base font-semibold"
                  : "text-sm font-semibold";
          return (
            <p key={key} className={`mt-3 pr-10 leading-snug ${WRAP_TEXT} ${size}`}>
              {line.text}
            </p>
          );
        }
        return (
          <p
            key={key}
            className={`mt-2 pr-10 leading-relaxed ${WRAP_TEXT} ${
              heading === "Header" && paraIndex === 0 ? "text-base font-semibold" : "text-sm"
            }`}
          >
            {line.text}
          </p>
        );
      })}
    </>
  );
}

function ScrapedHtmlPreview({
  html,
  sourceUrl,
  findings,
  notes = [],
  preferArticle = false,
}: {
  html: string;
  sourceUrl?: string | null;
  findings: PresentationFinding[];
  notes?: PresentationLayoutNote[];
  preferArticle?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState(480);
  const srcDoc = useMemo(
    () => sanitizeScrapedHtml(html, sourceUrl, { preferArticle }),
    [html, sourceUrl, preferArticle],
  );

  const layout = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.documentElement) return;
    pinFindingsInDocument(doc, findings, notes);
    const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 320);
    setContentHeight(height);
  }, [findings, notes]);

  useEffect(() => {
    layout();
  }, [layout, srcDoc]);

  return (
    <iframe
      ref={frameRef}
      title="Page HTML"
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={layout}
      className="pointer-events-none block w-full border-0 bg-white"
      style={{ height: contentHeight }}
    />
  );
}

function PagePreview({
  notes,
  sourceUrl,
  pageText,
  htmlPreview,
  findings,
  transcribing = false,
  variant = "webpage",
}: {
  notes: PresentationLayoutNote[];
  sourceUrl?: string | null;
  pageText?: string | null;
  htmlPreview?: string | null;
  findings: PresentationFinding[];
  transcribing?: boolean;
  variant?: DeliverableVariant;
}) {
  const markers = commentFindings(findings, variant);
  const liveLabel = variant === "blog" ? "article" : "homepage";
  const preferArticle = variant === "blog";
  const html = resolveScrapedPreviewHtml({
    htmlPreview,
    pageText,
    notes,
    sourceUrl,
    preferArticle,
  });
  const hasHtml = scrapedHtmlHasVisibleCopy(html, sourceUrl, { preferArticle });
  const blocks = pageCopyBlocks(notes, pageText, markers);
  const placedIds = new Set<string>();
  const blocksWithMarkers = blocks.map((block) => {
    const sectionMarkers = markers.filter((finding) => {
      const key = String(finding.id || finding.marker || "");
      if (!key || placedIds.has(key)) return false;
      const heading = SECTION_LABEL[(finding.region || "").toLowerCase()] || "Body";
      if (heading !== block.heading) return false;
      placedIds.add(key);
      return true;
    });
    return { ...block, markers: sectionMarkers };
  });
  const unplaced = markers.filter((finding) => !placedIds.has(String(finding.id || finding.marker || "")));
  return (
    <article className="overflow-hidden rounded-md border bg-background">
      <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Page HTML
      </p>
      {sourceUrl ? (
        <p className={`px-3 pt-1 text-[11px] text-muted-foreground ${WRAP_TEXT}`}>
          Snapshot of{" "}
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {sourceUrl}
          </a>
          . The live {liveLabel} cannot be embedded.
        </p>
      ) : (
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">
          HTML snapshot of the scraped {liveLabel}. The live {liveLabel} cannot be embedded.
        </p>
      )}
      <div className="relative mt-2 max-h-[40rem] overflow-auto bg-background">
        {hasHtml ? (
          <ScrapedHtmlPreview
            html={html || ""}
            sourceUrl={sourceUrl}
            findings={markers}
            notes={notes}
            preferArticle={preferArticle}
          />
        ) : blocksWithMarkers.length ? (
          <div className="space-y-4 px-4 py-4">
            {blocksWithMarkers.map((block, index) => (
              <section key={`${block.heading}-${index}`} className="relative border-b pb-4 last:border-b-0 last:pb-0">
                {block.markers.map((finding, markerIndex) => (
                  <span
                    key={finding.id || finding.marker || markerIndex}
                    className="absolute right-0 top-0 z-10 drop-shadow"
                  >
                    <Marker value={finding.marker || markerIndex + 1} />
                  </span>
                ))}
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {block.heading}
                </p>
                <ScrapedCopyLines text={block.excerpt} heading={block.heading} />
              </section>
            ))}
            {unplaced.map((finding, markerIndex) => (
              <span key={finding.id || finding.marker || markerIndex} className="ml-1 inline-block align-middle drop-shadow">
                <Marker value={finding.marker || markerIndex + 1} />
              </span>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[12rem] items-center justify-center p-6 text-sm text-muted-foreground">
            {transcribing
              ? "Scraping the page and placing numbered markers on the cited copy."
              : "No scraped page copy is stored for this review yet."}
          </div>
        )}
      </div>
    </article>
  );
}

function truncateExcerpt(value: string, max = 360): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function isSummitPerformanceDeck(findings: PresentationFinding[]): boolean {
  const ids = new Set(findings.map((item) => item.id));
  return ids.has("cherry_pick") && ids.has("hypothetical_backtest");
}

function findingAnchor(finding: PresentationFinding): string {
  if (finding.anchor && finding.anchor !== "slide copy") return finding.anchor;
  if (finding.region === "bar_chart" || finding.region === "gross_net") return "chart";
  if (finding.region === "callout") return finding.status === "held" ? "callout" : "removed callout";
  if (finding.region === "slide_footer" || finding.region === "benchmark") return "footer";
  if (finding.region === "slide_title") return "title";
  if (finding.region) return finding.region.replace(/_/g, " ");
  return "page copy";
}

function pageCaption(note: PresentationLayoutNote, page: number, variant: DeliverableVariant): string {
  const screenshot =
    variant === "email" ||
    note.label === "screenshot" ||
    (note.font_note || "").toLowerCase() === "screenshot";
  if (screenshot) {
    const extra =
      note.font_note && note.font_note.toLowerCase() !== "screenshot" ? ` · ${note.font_note}` : "";
    return `Screenshot${extra}`;
  }
  const kind = variant === "presentation" ? "Slide" : "Page";
  return `${kind} ${page}${note.font_note ? ` · ${note.font_note}` : ""}`;
}

function locationSuffix(finding: PresentationFinding, variant: DeliverableVariant): string {
  if (variant === "email" || !finding.slide) return "";
  return variant === "presentation" ? ` · slide ${finding.slide}` : ` · page ${finding.slide}`;
}

function cosineLabel(rules: CosineRule[] | undefined): string {
  const related = (rules || []).filter((item) => item.related);
  const visible = related.filter(
    (item) => !TOPIC_RULES.has(item.rule_id || "") || Number(item.cosine_similarity || 0) >= 0.5
  );
  if (!visible.length) return "";
  return visible
    .map((item) => `${item.rule_id} (${Number(item.cosine_similarity || 0).toFixed(2)})`)
    .join(" · ");
}

function slideNotes(notes: PresentationLayoutNote[]): PresentationLayoutNote[] {
  const byPage = new Map<number, PresentationLayoutNote>();
  for (const note of notes) {
    const region = note.region || "";
    if (!region.startsWith("slide_or_page_")) continue;
    const page = Number(note.page || region.split("_").pop() || 0);
    if (!page) continue;
    const existing = byPage.get(page);
    if (!existing) {
      byPage.set(page, note);
      continue;
    }
    const nextExcerpt = note.excerpt || "";
    const existingExcerpt = existing.excerpt || "";
    byPage.set(page, {
      ...existing,
      ...note,
      excerpt: nextExcerpt.length >= existingExcerpt.length ? nextExcerpt : existingExcerpt,
      slide_image_url: note.slide_image_url || existing.slide_image_url,
      slide_image_path: note.slide_image_path || existing.slide_image_path,
    });
  }
  return [...byPage.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, note]) => note);
}

function Marker({ value }: { value: number | string }) {
  const label = String(value);
  return (
    <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-none text-white">
      {label}
    </span>
  );
}

function hasScreenshotSlides(notes: PresentationLayoutNote[]): boolean {
  return notes.some(
    (note) =>
      Boolean(note.slide_image_url) || String(note.region || "").startsWith("slide_or_page_"),
  );
}

function emailFindingSection(finding: PresentationFinding): "subject" | "body" | "footer" | "none" {
  if (finding.id === "sequence_flag") return "none";
  const region = (finding.region || "").toLowerCase();
  const part = (finding.part || finding.anchor || "").toLowerCase();
  if (region === "subject" || region === "subject_line" || part.includes("subject")) return "subject";
  if (region === "email_footer" || part.includes("footer")) return "footer";
  if (!region && part === "sequence") return "none";
  return "body";
}

function mergeAwareText(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, index) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <code key={`m-${index}`} className="rounded bg-sky-50 px-1 font-mono text-[0.85em] text-sky-800">
        {part}
      </code>
    ) : (
      <span key={`t-${index}`}>{part}</span>
    ),
  );
}

function annotatedEmailText(text: string, findings: PresentationFinding[]) {
  const lower = text.toLowerCase();
  const hits: { start: number; end: number; finding: PresentationFinding }[] = [];
  const placed = new Set<string>();
  for (const finding of findings) {
    const needle = (finding.excerpt || finding.title || "").trim();
    if (!needle) continue;
    const index = lower.indexOf(needle.toLowerCase());
    if (index < 0) continue;
    const key = String(finding.id || finding.marker || "");
    if (key) placed.add(key);
    hits.push({ start: index, end: index + needle.length, finding });
  }
  hits.sort((left, right) => left.start - right.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, index) => {
    if (hit.start < cursor) return;
    if (hit.start > cursor) {
      nodes.push(<span key={`pre-${index}`}>{mergeAwareText(text.slice(cursor, hit.start))}</span>);
    }
    nodes.push(<span key={`hit-${index}`}>{mergeAwareText(text.slice(hit.start, hit.end))}</span>);
    nodes.push(
      <span key={`mark-${hit.finding.id || index}`} className="ml-1 inline-block align-middle drop-shadow">
        <Marker value={hit.finding.marker || index + 1} />
      </span>,
    );
    cursor = hit.end;
  });
  if (cursor < text.length) {
    nodes.push(<span key="tail">{mergeAwareText(text.slice(cursor))}</span>);
  }
  findings
    .filter((finding) => !placed.has(String(finding.id || finding.marker || "")))
    .forEach((finding, index) => {
      nodes.push(
        <span key={`loose-${finding.id || index}`} className="ml-1 inline-block align-middle drop-shadow">
          <Marker value={finding.marker || index + 1} />
        </span>,
      );
    });
  return nodes.length ? nodes : mergeAwareText(text);
}

function emailVisualParts(
  notes: PresentationLayoutNote[],
  pageText?: string | null,
): { from: string; to: string; subject: string; body: string; footer: string } {
  const byRegion: Record<string, string> = {};
  for (const note of notes) {
    const region = (note.region || "").toLowerCase();
    const excerpt = (note.excerpt || "").trim();
    if (!excerpt || region.startsWith("slide_or_page_")) continue;
    if (region === "subject" || region === "body" || region === "email_footer") {
      byRegion[region] = excerpt;
    }
  }
  const raw = (pageText || "").replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  const from = raw.match(/^from\s*:\s*(.+)$/im)?.[1]?.trim() || "";
  const to = raw.match(/^to\s*:\s*(.+)$/im)?.[1]?.trim() || "";
  let subject = byRegion.subject || "";
  let body = byRegion.body || "";
  let footer = byRegion.email_footer || "";
  if (raw && (!subject || !body || !footer)) {
    const subjectLine = raw.match(/^subject\s*:\s*(.+)$/im);
    if (!subject) subject = subjectLine?.[1]?.trim() || "";
    let lastHeaderEnd = 0;
    let foundHeader = false;
    const headerRe = /^(template|subject|from|to|cc|bcc|date|sent)\s*:.*$/gim;
    for (const match of raw.matchAll(headerRe)) {
      foundHeader = true;
      lastHeaderEnd = (match.index ?? 0) + match[0].length;
    }
    const rest = foundHeader ? raw.slice(lastHeaderEnd).replace(/^\n+/, "") : raw;
    const footerMatch = rest.match(/^(?:footer\s*:|\s*unsubscribe\b).+/im);
    if (!body || !footer) {
      if (footerMatch && footerMatch.index !== undefined) {
        if (!body) body = rest.slice(0, footerMatch.index).replace(/\s+$/, "");
        if (!footer) footer = rest.slice(footerMatch.index).replace(/^footer\s*:\s*/i, "").trim();
      } else if (!body) {
        body = rest.trim();
      }
    }
  }
  return { from, to, subject, body, footer };
}

function EmailPreview({
  notes,
  pageText,
  findings,
  transcribing = false,
}: {
  notes: PresentationLayoutNote[];
  pageText?: string | null;
  findings: PresentationFinding[];
  transcribing?: boolean;
}) {
  const markers = commentFindings(findings).filter((item) => emailFindingSection(item) !== "none");
  const parts = emailVisualParts(notes, pageText);
  const bySection = {
    subject: markers.filter((item) => emailFindingSection(item) === "subject"),
    body: markers.filter((item) => emailFindingSection(item) === "body"),
    footer: markers.filter((item) => emailFindingSection(item) === "footer"),
  };
  const hasCopy = Boolean(parts.subject || parts.body || parts.footer);
  return (
    <article className="overflow-hidden rounded-md border bg-white">
      <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Email
      </p>
      {hasCopy ? (
        <div className="space-y-4 px-4 py-4">
          {parts.from || parts.to ? (
            <div className="space-y-1 border-b pb-3 text-sm">
              {parts.from ? (
                <p className={WRAP_TEXT}>
                  <span className="text-muted-foreground">From </span>
                  {mergeAwareText(parts.from)}
                </p>
              ) : null}
              {parts.to ? (
                <p className={WRAP_TEXT}>
                  <span className="text-muted-foreground">To </span>
                  {mergeAwareText(parts.to)}
                </p>
              ) : null}
            </div>
          ) : null}
          {parts.subject ? (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Subject
              </p>
              <p className={`mt-1 text-sm font-medium ${WRAP_TEXT}`}>
                {annotatedEmailText(parts.subject, bySection.subject)}
              </p>
            </section>
          ) : null}
          {parts.body ? (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Body
              </p>
              <p className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed ${WRAP_TEXT}`}>
                {annotatedEmailText(parts.body, bySection.body)}
              </p>
            </section>
          ) : null}
          {parts.footer ? (
            <section className="border-t pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Footer
              </p>
              <p className={`mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground ${WRAP_TEXT}`}>
                {annotatedEmailText(parts.footer, bySection.footer)}
              </p>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[12rem] items-center justify-center p-6 text-sm text-muted-foreground">
          {transcribing
            ? "Reading the email and placing numbered markers on the cited copy."
            : "No email copy is stored for this review yet."}
        </div>
      )}
    </article>
  );
}

function SummitRetailSlide({ findings }: { findings: PresentationFinding[] }) {
  const afterAnswers = findings.some(
    (item) => item.id === "hypothetical_backtest" && item.status !== "held"
  );
  return (
    <div className="relative overflow-hidden rounded-md border bg-background p-4">
      <p className="text-lg font-semibold tracking-tight">Performance That Speaks for Itself</p>
      <div className="mt-4 grid grid-cols-3 items-end gap-3">
        <div className="space-y-2">
          <p className="text-center text-[11px] text-muted-foreground">1 year (2025)</p>
          <div className="flex items-end justify-center gap-2">
            <div className="flex h-24 w-10 items-end justify-center rounded-sm bg-sky-700 text-[10px] font-semibold text-white">
              22.4%
            </div>
            <div className="flex h-20 w-10 items-end justify-center rounded-sm bg-emerald-700 text-[10px] font-semibold text-white">
              20.1%
            </div>
          </div>
        </div>
        {["5 year", "Since inception"].map((label) => (
          <div key={label} className="space-y-2">
            <p className="text-center text-[11px] text-muted-foreground">{label}</p>
            <div className="flex items-end justify-center gap-2">
              <div className="flex h-16 w-10 items-center justify-center rounded-sm border border-dashed border-sky-700 text-[9px] text-sky-800">
                [firm to supply]
              </div>
              <div className="flex h-16 w-10 items-center justify-center rounded-sm border border-dashed border-emerald-700 text-[9px] text-emerald-800">
                [firm to supply]
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-sky-700" /> Gross of fees
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-700" /> Net of fees
        </span>
        <span className="relative ml-2">
          <Marker value={1} />
        </span>
      </div>
      {afterAnswers ? (
        <div className="relative mt-4 rounded-md border border-dashed border-red-500 p-3 text-xs text-red-700">
          <span className="absolute -left-2 -top-2">
            <Marker value={2} />
          </span>
          Backtest callout removed from retail version — moved to institutional deck, slide 7a, with
          methodology page.
        </div>
      ) : (
        <div className="relative mt-4 rounded-md bg-amber-100 p-3 text-xs">
          <span className="absolute -left-2 -top-2">
            <Marker value={2} />
          </span>
          Backtested to 1999, our model would have returned 14.2% annually — through two crashes.
        </div>
      )}
      <p className="relative mt-4 text-[11px] leading-snug text-muted-foreground">
        <span className="absolute -left-1 top-0">
          <Marker value={3} />
        </span>
        <span className="ml-6">
          Benchmark is S&P 500 total return (dividends reinvested). Past performance does not
          guarantee future results. Net returns reflect deduction of advisory fees.
        </span>
      </p>
    </div>
  );
}

function SlideStack({
  notes,
  findings,
  transcribing = false,
  variant = "presentation",
}: {
  notes: PresentationLayoutNote[];
  findings: PresentationFinding[];
  transcribing?: boolean;
  variant?: DeliverableVariant;
}) {
  const commentFindingsList = commentFindings(findings, variant);
  const markersBySlide = new Map<number, PresentationFinding[]>();
  for (const finding of commentFindingsList) {
    const page = Number(finding.slide || 0) || (variant === "presentation" ? 0 : 1);
    if (!page) continue;
    const current = markersBySlide.get(page) || [];
    current.push(finding);
    markersBySlide.set(page, current);
  }
  const affectedPages = new Set(markersBySlide.keys());
  const showAllPages =
    transcribing ||
    variant === "email" ||
    variant === "blog" ||
    notes.some((note) => Boolean(note.slide_image_url));
  const slides = slideNotes(notes).filter((note) => {
    if (showAllPages) return true;
    const page = Number(note.page || String(note.region || "").split("_").pop() || 0);
    return affectedPages.has(page);
  });
  if (!slides.length) {
    return null;
  }
  return (
    <div className="space-y-3">
      {slides.map((note, index) => {
        const page = Number(note.page || String(note.region || "").split("_").pop() || index + 1);
        const markers = markersBySlide.get(page) || [];
        return (
          <article key={`${note.region}-${index}`} className="relative overflow-hidden rounded-md border bg-background">
            <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {pageCaption(note, page, variant)}
            </p>
            {note.slide_image_url ? (
              <div className="relative mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={note.slide_image_url}
                  alt={pageCaption(note, page, variant)}
                  className="block w-full bg-muted object-contain"
                />
                <MarkerOverlay findings={markers} />
              </div>
            ) : (
              <div className="relative mt-2 min-h-[36rem] bg-white p-3">
                {note.excerpt ? (
                  <p className={`whitespace-pre-wrap text-sm ${WRAP_TEXT}`}>
                    {variant === "presentation" ? truncateExcerpt(note.excerpt) : note.excerpt}
                  </p>
                ) : (
                  <p className={`text-sm text-muted-foreground ${WRAP_TEXT}`}>
                    {transcribing
                      ? variant === "presentation"
                        ? `Screenshot slide${note.image_count ? ` · ${note.image_count} image${note.image_count === 1 ? "" : "s"}` : ""}. Vision is transcribing this page for review.`
                          : variant === "email"
                          ? "Transcribing this email screenshot for marked review."
                          : "Transcribing this screenshot and placing numbered markers on the cited copy."
                      : variant === "presentation"
                        ? "Screenshot slide. PowerPoint had no selectable text on this page."
                        : variant === "email"
                          ? "Email screenshot is not available yet."
                          : "Article screenshot is not available yet."}
                  </p>
                )}
                <MarkerOverlay findings={markers} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function FindingCard({
  finding,
  index,
  selected,
  onSelect,
  variant = "presentation",
}: {
  finding: PresentationFinding;
  index: number;
  selected: Record<string, string>;
  onSelect: (findingId: string, option: string) => void;
  variant?: DeliverableVariant;
}) {
  const findingId = finding.id || "";
  const marker = finding.marker || index + 1;
  const recommended = finding.recommended_option || "redline";
  const accepted = selected[findingId] === recommended;
  const rejected = selected[findingId] === "do_nothing";
  return (
    <article className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
        <span>Reg AI agent</span>
        <span aria-hidden>·</span>
        <Marker value={`C${marker}`} />
        <span>
          · {variant === "email" ? finding.part || findingAnchor(finding) : `anchored to ${findingAnchor(finding)}`}
        </span>
      </p>
      <p className={`mt-1 text-sm font-medium ${WRAP_TEXT}`}>
        {looksLikeBinaryDump(finding.title || finding.excerpt || "")
          ? "Screenshot copy"
          : finding.title || finding.excerpt}
        {locationSuffix(finding, variant)}
      </p>
      {finding.rule ? (
        <Badge variant="outline" className="mt-1">
          {finding.rule}
        </Badge>
      ) : null}
      {finding.excerpt && !looksLikeBinaryDump(finding.excerpt) ? (
        <p className={`mt-2 text-sm ${WRAP_TEXT}`}>
          <span className="font-semibold text-amber-900">Cause. </span>
          {finding.excerpt}
        </p>
      ) : null}
      <p className={`mt-2 text-sm ${WRAP_TEXT}`}>{finding.why}</p>
      {finding.draft_text ? (
        <p className={`mt-2 text-xs text-muted-foreground ${WRAP_TEXT}`}>
          <span className="font-semibold uppercase tracking-wide">Fix. </span>
          {finding.draft_text}
        </p>
      ) : null}
      {finding.status === "held" ? (
        <p className="mt-2 text-xs text-muted-foreground">Held until the questions above are answered.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={accepted ? "default" : "outline"}
            onClick={() => onSelect(findingId, recommended)}
          >
            Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant={rejected ? "default" : "outline"}
            onClick={() => onSelect(findingId, "do_nothing")}
          >
            Reject
          </Button>
        </div>
      )}
    </article>
  );
}

function SequenceFlagCard({ finding }: { finding: PresentationFinding }) {
  return (
    <article className="rounded-md border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sequence flag
      </p>
      {finding.title ? <p className={`mt-1 text-sm font-medium ${WRAP_TEXT}`}>{finding.title}</p> : null}
      {finding.why ? <p className={`mt-2 text-sm ${WRAP_TEXT}`}>{finding.why}</p> : null}
    </article>
  );
}

function FindingWheel({
  comments,
  selected,
  onSelect,
  transcribing = false,
  variant = "presentation",
  sequenceFlags = [],
}: {
  comments: PresentationFinding[];
  selected: Record<string, string>;
  onSelect: (findingId: string, option: string) => void;
  transcribing?: boolean;
  variant?: DeliverableVariant;
  sequenceFlags?: PresentationFinding[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function updateActiveFromScroll() {
    const root = scrollerRef.current;
    if (!root) return;
    const panels = Array.from(root.children) as HTMLElement[];
    if (!panels.length) return;
    const midpoint = root.scrollTop + root.clientHeight / 2;
    let closest = 0;
    let closestDelta = Number.POSITIVE_INFINITY;
    panels.forEach((panel, index) => {
      const center = panel.offsetTop + panel.offsetHeight / 2;
      const delta = Math.abs(center - midpoint);
      if (delta < closestDelta) {
        closestDelta = delta;
        closest = index;
      }
    });
    setActiveIndex(closest);
  }

  function scrollToIndex(index: number) {
    const root = scrollerRef.current;
    if (!root) return;
    const next = Math.min(Math.max(index, 0), Math.max(comments.length - 1, 0));
    const panel = root.children[next] as HTMLElement | undefined;
    if (!panel) return;
    root.scrollTo({ top: panel.offsetTop, behavior: "smooth" });
    setActiveIndex(next);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 pb-2">
        <p className="text-xs text-muted-foreground">
          {comments.length
            ? `Finding ${activeIndex + 1} of ${comments.length}`
            : "No findings"}
        </p>
        {comments.length > 1 ? (
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 w-7 px-0"
              disabled={activeIndex <= 0}
              aria-label="Previous finding"
              onClick={() => scrollToIndex(activeIndex - 1)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 w-7 px-0"
              disabled={activeIndex >= comments.length - 1}
              aria-label="Next finding"
              onClick={() => scrollToIndex(activeIndex + 1)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
      {comments.length || sequenceFlags.length ? (
        <div
          ref={scrollerRef}
          onScroll={updateActiveFromScroll}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain"
        >
          {comments.map((finding, index) => (
            <FindingCard
              key={finding.id || finding.marker || index}
              finding={finding}
              index={index}
              selected={selected}
              onSelect={onSelect}
              variant={variant}
            />
          ))}
          {sequenceFlags.map((finding, index) => (
            <SequenceFlagCard key={finding.id || `sequence-${index}`} finding={finding} />
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          {transcribing
            ? variant === "presentation"
              ? "Transcribing screenshot slides with vision, then reviewing the extracted text against the marketing rules."
              : variant === "email"
                ? "Reading the email and placing numbered markers on the cited copy."
                : variant === "blog"
                  ? "Reading the article screenshot and placing numbered markers on the cited copy."
                : "Scraping the page and placing numbered markers on the cited copy."
            : variant === "presentation"
              ? "No findings on these slides after image transcription."
              : variant === "email"
                ? "No findings on this email yet."
                : variant === "blog"
                  ? "No findings on this screenshot yet."
                : "No findings on this scraped page."}
        </div>
      )}
      {variant === "presentation" ? (
        <div className="mt-2 rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
          Figures reviewed for presentation compliance only. The agent has not verified whether any
          figure is accurate.
        </div>
      ) : null}
    </div>
  );
}

export function PresentationDeliverable({
  name,
  findings,
  layoutNotes,
  selected,
  onSelect,
  cosineRules,
  reviewedAt,
  transcribing = false,
  variant = "presentation",
  pageUrl,
  pageText,
  htmlPreview,
}: PresentationDeliverableProps) {
  const summit = isSummitPerformanceDeck(findings) && !layoutNotes.some((note) => note.slide_image_url);
  const related = cosineLabel(cosineRules);
  const comments = useMemo(() => {
    const filtered = commentFindings(findings, variant);
    if (variant === "webpage" || variant === "blog") {
      const preferArticle = variant === "blog";
      const html = resolveScrapedPreviewHtml({
        htmlPreview,
        pageText,
        notes: layoutNotes,
        sourceUrl: pageUrl,
        preferArticle,
      });
      if (html) {
        return numberFindingsByDocumentOrder(
          sanitizeScrapedHtml(html, pageUrl, { preferArticle }),
          filtered,
          layoutNotes,
        );
      }
    }
    return [...filtered].sort((left, right) => {
      const slideLeft = Number(left.slide || 0) || 9999;
      const slideRight = Number(right.slide || 0) || 9999;
      if (slideLeft !== slideRight) return slideLeft - slideRight;
      return Number(left.marker || 0) - Number(right.marker || 0);
    });
  }, [findings, variant, htmlPreview, pageText, layoutNotes, pageUrl]);
  const sequenceFlags = useMemo(
    () => findings.filter((item) => item.id === "sequence_flag"),
    [findings],
  );
  const screenshotCapture =
    (variant === "email" || variant === "blog") && hasScreenshotSlides(layoutNotes);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-background px-3 py-2">
        <div>
          <p className="text-sm font-semibold tracking-wide">REG AI</p>
          <p className={`text-xs text-muted-foreground ${WRAP_TEXT}`}>
            Marketing Review · {name}
            {summit ? " · slide 7 (retail version)" : ""}
          </p>
          {reviewedAt ? (
            <p className="text-xs text-muted-foreground">Reviewed {reviewedAt} · SEC 206(4)-1</p>
          ) : (
            <p className="text-xs text-muted-foreground">SEC 206(4)-1</p>
          )}
        </div>
        <span className="rounded-md bg-orange-500 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          Draft — CCO review required
        </span>
      </div>
      {related ? <p className={`text-xs text-muted-foreground ${WRAP_TEXT}`}>Related rules: {related}</p> : null}

      <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="min-w-0 space-y-2">
          {summit ? (
            <SummitRetailSlide findings={findings} />
          ) : screenshotCapture ? (
            <SlideStack
              notes={layoutNotes}
              findings={findings}
              transcribing={transcribing}
              variant={variant}
            />
          ) : variant === "email" ? (
            <EmailPreview
              notes={layoutNotes}
              pageText={pageText}
              findings={comments}
              transcribing={transcribing}
            />
          ) : variant !== "presentation" ? (
            <PagePreview
              notes={layoutNotes}
              sourceUrl={pageUrl}
              pageText={pageText}
              htmlPreview={htmlPreview}
              findings={comments}
              transcribing={transcribing}
              variant={variant}
            />
          ) : (
            <SlideStack
              notes={layoutNotes}
              findings={findings}
              transcribing={transcribing}
              variant={variant}
            />
          )}
        </section>

        <aside className="relative min-h-[32rem] min-w-0 lg:min-h-0">
          <div className="absolute inset-0">
            <FindingWheel
              comments={comments}
              selected={selected}
              onSelect={onSelect}
              transcribing={transcribing}
              variant={variant}
              sequenceFlags={sequenceFlags}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
