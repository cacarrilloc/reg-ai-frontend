"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { invalidateCache } from "@/lib/api-cache";
import { downloadRevisionRedline, redlineDownloadFilename } from "@/lib/download-revision-redline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PresentationDeliverable } from "@/components/marketing/presentation-deliverable";

const OPTIONS = [
  { value: "redline", label: "Redline" },
  { value: "add_disclosure", label: "Add disclosure" },
  { value: "pull", label: "Pull" },
  { value: "do_nothing", label: "Do nothing" },
  { value: "escalate", label: "Escalate" }
] as const;

const VISUAL_PASS_FORMATS = new Set(["webpage", "presentation", "social", "email", "blog", "image"]);
const BLOG_REGION_LABELS: Record<string, string> = {
  title: "TITLE",
  educational: "PARAS 1–5, EDUCATIONAL",
  para_6: "PARA 6",
  para_7: "PARA 7",
  closing: "CLOSING",
  button: "BUTTON",
  disclosures: "NO DISCLOSURES"
};
const PRESENTATION_REGION_LABELS: Record<string, string> = {
  slide_title: "SLIDE TITLE",
  bar_chart: "BAR CHART",
  callout: "CALLOUT BOX",
  slide_footer: "BOTTOM RIGHT",
  appendix: "APPENDIX",
  diagram: "DIAGRAM",
  gross_net: "BAR CHART",
  benchmark: "BAR CHART",
  title: "SLIDE TITLE"
};
const WRAP_TEXT = "min-w-0 max-w-full break-words [overflow-wrap:anywhere]";
const WRAP_URL = "min-w-0 max-w-full break-all";

function wrapClass(value: string): string {
  return /https?:\/\/|\S{40,}/i.test(value) ? WRAP_URL : WRAP_TEXT;
}

function isPlaceholderDiagramExcerpt(value: string | undefined): boolean {
  return /^embedded diagram on slide \d+\s*\([^)]+\)\.?\s*$/i.test((value || "").trim());
}

function stripTitleTracking(value: string): string {
  return value
    .replace(/https?:\/\/[^\s<>"']+/gi, " ")
    .replace(/\bwww\.[^\s<>"']+/gi, " ")
    .replace(/\?[^\s<>"']*(utm_|hsa_|gad_|gclid|fbclid)[^\s<>"']*/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-|·•,;:/]+|[\s\-|·•,;:/]+$/g, "")
    .trim();
}

function displayHomepageUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "") || parsed.origin;
  } catch {
    return trimmed.split("?")[0].split("#")[0];
  }
}

function ruleChrome(format?: string): string {
  if (format === "social") return " · FINRA 2210 / 2010";
  if (format === "webpage" || format === "presentation" || format === "email" || format === "blog" || format === "image") {
    return " · SEC 206(4)-1";
  }
  return "";
}

type MarketingFinding = {
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
  part?: string;
  anchor?: string;
  marker_x?: number;
  marker_y?: number;
};

type MarketingQuestion = {
  id?: string;
  prompt?: string;
  optional?: boolean;
};

function isOptionalQuestion(question: MarketingQuestion): boolean {
  return Boolean(question.optional) || question.id === "testimonial_paid";
}

type LayoutNote = {
  region?: string;
  font_note?: string;
  excerpt?: string;
  below_fold?: boolean;
  source_url?: string;
  page?: number;
  image_count?: number;
  slide_image_url?: string;
  slide_image_path?: string;
  label?: string;
};

function presentationRegionLabel(note: LayoutNote): string {
  const region = note.region || "region";
  if (region.startsWith("slide_or_page_")) {
    return `SLIDE ${note.page || region.split("_").pop()}`;
  }
  return PRESENTATION_REGION_LABELS[region] || region.replace(/_/g, " ");
}

const EMAIL_FINDING_PARTS: Record<string, string> = {
  subject_line: "subject line",
  relative_performance: "87% claim",
  third_party_rating: "rating",
  scarcity: "scarcity",
  free_offer: "body",
  sequence_flag: "sequence"
};

function emailPartLabel(finding: MarketingFinding): string {
  if (finding.part) return finding.part;
  if (finding.id && EMAIL_FINDING_PARTS[finding.id]) return EMAIL_FINDING_PARTS[finding.id];
  const region = (finding.region || "").replace(/_/g, " ").trim();
  if (region === "subject") return "subject line";
  if (region === "email footer") return "email footer";
  const blob = `${finding.title || ""} ${finding.excerpt || ""}`.toLowerCase();
  if (blob.includes("87%") || blob.includes("outperformed")) return "87% claim";
  if (blob.includes("rating") || blob.includes("top 100")) return "rating";
  if (blob.includes("filling fast") || blob.includes("scarcity")) return "scarcity";
  if (blob.includes("subject")) return "subject line";
  return region || "body";
}

function emailFindingHeading(finding: MarketingFinding, marker: number): string {
  if (finding.id === "sequence_flag") return "Sequence flag";
  return `C${marker} · ${emailPartLabel(finding)}`;
}

function splitEmailVisualParts(text: string): { subject: string; body: string; footer: string } {
  const stripped = text.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  const subjectLine = stripped.match(/^subject\s*:\s*(.+)$/im);
  let subject = subjectLine?.[1]?.trim() || "";
  let lastHeaderEnd = 0;
  let foundHeader = false;
  const headerRe = /^(template|subject|from|to|cc|bcc|date|sent)\s*:.*$/gim;
  for (const match of stripped.matchAll(headerRe)) {
    foundHeader = true;
    lastHeaderEnd = (match.index ?? 0) + match[0].length;
  }
  const rest = foundHeader ? stripped.slice(lastHeaderEnd).replace(/^\n+/, "") : stripped;
  const footerMatch = rest.match(/^(?:footer\s*:|\s*unsubscribe\b).+/im);
  let body = rest;
  let footer = "Standard unsubscribe + firm address. No performance or rating disclosures.";
  if (footerMatch && footerMatch.index !== undefined) {
    body = rest.slice(0, footerMatch.index).replace(/\s+$/, "");
    footer = rest.slice(footerMatch.index).replace(/^footer\s*:\s*/i, "").trim();
  } else {
    body = rest.trim();
  }
  if (!subject) {
    const conceal = stripped
      .split("\n")
      .find((line) => /most advisors won['’]?t tell you this/i.test(line));
    if (conceal) {
      subject = conceal.replace(/^subject\s*:\s*/i, "").trim().replace(/^["']|["']$/g, "");
    }
  }
  return { subject, body, footer };
}

function blogRegionLabel(note: LayoutNote): string {
  const region = note.region || "region";
  if (region === "disclosures") {
    const font = (note.font_note || "").toLowerCase();
    const excerpt = (note.excerpt || "").toLowerCase();
    if (font.includes("no disclosure") || excerpt.startsWith("no disclosures")) {
      return "NO DISCLOSURES";
    }
    return "DISCLOSURES";
  }
  return BLOG_REGION_LABELS[region] || region.replace(/_/g, " ");
}

export type MarketingReview = {
  id: string;
  status: string;
  findings: MarketingFinding[];
  questions?: MarketingQuestion[];
  answers?: Record<string, string>;
  change_list?: Array<Record<string, unknown>>;
  selected_options?: Array<{ finding_id?: string; option?: string }>;
  classification?: Record<string, unknown>;
  rule_versions?: {
    version?: string;
    unvalidated?: boolean;
    cosine_similarity?: {
      homepage_chunk_count?: number;
      related_rule_ids?: string[];
      slide_count?: number;
      slides?: Array<{
        page?: number;
        related_rule_ids?: string[];
        content_chunk_count?: number;
      }>;
      rules?: Array<{
        rule_id?: string;
        regulator?: string;
        cosine_similarity?: number;
        related?: boolean;
        source?: string;
      }>;
      error?: string | null;
    } | null;
  };
  layout_notes?: LayoutNote[];
  output_kind?: string | null;
  report_header?: string | null;
  performance_disclaimer?: string | null;
  error_message?: string | null;
  mode?: string;
  created_at?: string;
  cco_revision_id?: string | null;
  cco_policy_name?: string | null;
};

export type MarketingContentDetail = {
  id: string;
  name: string;
  status: string;
  format?: string;
  audience?: string;
  registrant_type?: string;
  source_url?: string | null;
  content_tags?: string[];
  body_text?: string | null;
  layout_notes?: LayoutNote[];
  html_preview?: string | null;
  latest_review?: MarketingReview | null;
};

type MarketingReviewPanelProps = {
  contentId: string;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  onSentToCcoReview?: () => void;
};

export function MarketingReviewPanel({
  contentId,
  authState = "ready",
  getAuthToken,
  orgId,
  onSentToCcoReview,
}: MarketingReviewPanelProps) {
  const [detail, setDetail] = useState<MarketingContentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDownloadingRedline, setIsDownloadingRedline] = useState(false);

  const loadDetail = useCallback(async () => {
    if (authState !== "ready") return;
    const token = getAuthToken ? await getAuthToken() : null;
    const response = await apiFetch<MarketingContentDetail>(
      `/api/v1/marketing/contents/${contentId}`,
      undefined,
      { token, orgId }
    );
    setDetail(response);
    const review = response.latest_review;
    if (review?.answers) {
      setAnswers((current) => ({ ...review.answers, ...current }));
    }
    if (review?.selected_options?.length) {
      setSelected(
        Object.fromEntries(
          review.selected_options
            .filter((item) => item.finding_id && item.option)
            .map((item) => [item.finding_id as string, item.option as string])
        )
      );
    }
  }, [authState, contentId, getAuthToken, orgId]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        setError(null);
        await loadDetail();
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load this review.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [loadDetail]);

  const review = detail?.latest_review;
  const reviewDone = ["ready_for_cco", "signed_off", "awaiting_answers", "failed"].includes(
    review?.status || ""
  );
  const pending =
    !reviewDone &&
    (review?.status === "queued" ||
      review?.status === "running" ||
      detail?.status === "queued" ||
      detail?.status === "in_review");

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      void loadDetail().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pending, loadDetail]);

  const openFindings = useMemo(() => review?.findings ?? [], [review]);
  const visualNotes = useMemo(
    () => {
      const reviewNotes = review?.layout_notes || [];
      const detailNotes = detail?.layout_notes || [];
      const hasScreenshot = (notes: LayoutNote[]) =>
        notes.some(
          (note) =>
            Boolean(note.slide_image_url) || String(note.region || "").startsWith("slide_or_page_"),
        );
      let source = reviewNotes.length > 0 ? reviewNotes : detailNotes;
      if (!hasScreenshot(source) && hasScreenshot(detailNotes)) {
        source = [
          ...detailNotes.filter(
            (note) =>
              Boolean(note.slide_image_url) || String(note.region || "").startsWith("slide_or_page_"),
          ),
          ...source,
        ];
      }
      const emailParts =
        detail?.format === "email" && detail.body_text
          ? splitEmailVisualParts(detail.body_text)
          : null;
      return source
        .filter((note) => note.region !== "fetched_page")
        .map((note) => {
          const excerpt = isPlaceholderDiagramExcerpt(note.excerpt) ? "" : note.excerpt;
          const region = (note.region || "").toLowerCase();
          if (emailParts) {
            if (region === "subject" && emailParts.subject) {
              return { ...note, excerpt: emailParts.subject };
            }
            if (region === "body" && emailParts.body) {
              return { ...note, excerpt: emailParts.body };
            }
            if (region === "email_footer" && emailParts.footer) {
              return { ...note, excerpt: emailParts.footer };
            }
          }
          if (region !== "title") {
            return excerpt === note.excerpt ? note : { ...note, excerpt };
          }
          if (detail?.format === "blog") return { ...note, excerpt };
          const homepageUrl =
            displayHomepageUrl(note.source_url || detail?.source_url || "") ||
            (note.font_note && note.font_note !== "page title" ? note.font_note : "");
          return {
            ...note,
            excerpt: stripTitleTracking(excerpt || ""),
            font_note: homepageUrl
          };
        })
        .filter((note) => (note.region || "").toLowerCase() !== "title" || Boolean(note.excerpt));
    },
    [detail?.body_text, detail?.format, detail?.layout_notes, detail?.source_url, review]
  );
  const reviewQuestions = review?.questions || [];
  const hasRequiredQuestion = reviewQuestions.some((question) => !isOptionalQuestion(question));
  const unansweredRequired = reviewQuestions.filter(
    (question) =>
      question.id &&
      !isOptionalQuestion(question) &&
      !(answers[question.id] || "").trim()
  );
  const blocksSignOff =
    isSaving ||
    isDownloadingRedline ||
    review?.status === "signed_off" ||
    (review?.status === "awaiting_answers" && unansweredRequired.length > 0);

  function selectedOptionsForCco() {
    return openFindings.flatMap((finding) => {
      const findingId = finding.id;
      if (!findingId) return [];
      const option = selected[findingId] || finding.recommended_option;
      if (!option || option === "held") return [];
      return [{ finding_id: findingId, option }];
    });
  }

  async function submitAnswers() {
    if (!review) return;
    setIsSaving(true);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        `/api/v1/marketing/reviews/${review.id}/answers`,
        { method: "POST", body: JSON.stringify({ answers }) },
        { token, orgId }
      );
      await loadDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save answers.");
    } finally {
      setIsSaving(false);
    }
  }

  async function retryReview() {
    setIsRetrying(true);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        `/api/v1/marketing/contents/${contentId}/review`,
        { method: "POST" },
        { token, orgId }
      );
      await loadDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to restart this review.");
    } finally {
      setIsRetrying(false);
    }
  }

  async function signOff() {
    if (!review) return;
    const selected_options = selectedOptionsForCco();
    if (selected_options.length === 0) {
      setError("Select an option for each finding before sending to CCO review.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        `/api/v1/marketing/reviews/${review.id}/decision`,
        { method: "PUT", body: JSON.stringify({ selected_options, status: "signed_off" }) },
        { token, orgId }
      );
      invalidateCache("/api/v1/reviews/pending");
      invalidateCache("reviews-pending");
      invalidateCache("/api/v1/gap-analyses");
      onSentToCcoReview?.();
      await loadDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send to CCO review.");
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadRedlineDoc() {
    if (!review) return;
    const selected_options = selectedOptionsForCco();
    if (selected_options.length === 0 && !review.cco_revision_id && !(review.selected_options || []).length) {
      setError("Select an option for each finding before downloading the redline.");
      return;
    }
    setIsDownloadingRedline(true);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      let revisionId = review.cco_revision_id || "";
      let policyName = review.cco_policy_name || detail?.name || "Marketing";
      if (!revisionId || review.status !== "signed_off") {
        const prepared = await apiFetch<{ revision_id: string; policy_name: string }>(
          `/api/v1/marketing/reviews/${review.id}/prepare-redline`,
          { method: "POST", body: JSON.stringify({ selected_options }) },
          { token, orgId }
        );
        revisionId = prepared.revision_id;
        policyName = prepared.policy_name || policyName;
      }
      await downloadRevisionRedline({
        revisionId,
        filename: redlineDownloadFilename(policyName),
        token,
        orgId,
      });
      await loadDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download redline.");
    } finally {
      setIsDownloadingRedline(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading review
      </div>
    );
  }
  if (error && !detail) {
    return <p className="mt-3 border-t pt-3 text-sm text-destructive">{error}</p>;
  }
  if (!review) {
    return <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">Review has not started yet.</p>;
  }

  const isPresentation = detail?.format === "presentation";
  const isEmail = detail?.format === "email";
  const isImageCapture = detail?.format === "image" || detail?.format === "social";
  const screenshotFormat = detail?.format === "webpage" || detail?.format === "blog" ? detail.format : null;
  const useMarkedScreenshots = isPresentation || isEmail || isImageCapture || Boolean(screenshotFormat);
  return (
    <div className="mt-3 min-w-0 space-y-4 overflow-hidden border-t pt-3">
      {useMarkedScreenshots ? null : (
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Draft — CCO review required
        </p>
        <p className={`text-sm font-medium ${WRAP_TEXT}`}>{review.report_header}</p>
        <p className={`text-xs text-muted-foreground ${WRAP_TEXT}`}>{review.performance_disclaimer}</p>
        <p className={`mt-1 text-xs text-muted-foreground ${WRAP_TEXT}`}>
          {detail?.name ? `Marketing review — ${detail.name}` : "Marketing review"}
          {ruleChrome(detail?.format)}
        </p>
      </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Mode {review.mode || "A"}</Badge>
        <Badge variant="outline">{detail?.format || "text"}</Badge>
        {review.rule_versions?.unvalidated ? (
          <Badge variant="outline">New rule — unvalidated</Badge>
        ) : null}
        {(detail?.content_tags || []).map((tag) => (
          <Badge key={tag} variant="outline">
            {tag.replace(/_/g, " ")}
          </Badge>
        ))}
      </div>
      {!useMarkedScreenshots && review.rule_versions?.cosine_similarity?.rules?.length ? (
        <p className={`text-xs text-muted-foreground ${WRAP_TEXT}`}>
          Cosine-related rules:{" "}
          {(review.rule_versions.cosine_similarity.rules || [])
            .filter((item) => item.related)
            .map((item) => `${item.rule_id} (${Number(item.cosine_similarity || 0).toFixed(2)})`)
            .join(" · ") || "none above the interrelated threshold"}
        </p>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">The review is running. This page will refresh automatically.</p>
          <Button type="button" variant="outline" size="sm" disabled={isRetrying} onClick={() => void retryReview()}>
            {isRetrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Retry review
          </Button>
        </div>
      ) : null}
      {review.error_message ? <p className="text-sm text-destructive">{review.error_message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {(review.questions || []).length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">
            {detail?.format === "presentation" ? "Questions the agent asks" : "Questions that change the finding"}
          </h3>
          {(review.questions || []).map((question) => (
            <div key={question.id || question.prompt} className="grid gap-2">
              <Label htmlFor={`q-${question.id}`}>
                {question.prompt}
                {isOptionalQuestion(question) ? (
                  <span className="font-normal text-muted-foreground"> (optional)</span>
                ) : null}
              </Label>
              <Textarea
                id={`q-${question.id}`}
                value={answers[question.id || ""] || ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.id || ""]: event.target.value }))
                }
              />
            </div>
          ))}
          <Button type="button" size="sm" onClick={() => void submitAnswers()} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {hasRequiredQuestion ? "Submit answers and continue" : "Apply answers"}
          </Button>
        </section>
      ) : null}

      {openFindings.some((finding) => finding.id === "principal_approval" && finding.recommended_option === "pull") ? (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm">
          <p className="font-semibold text-destructive">Recommended action: take the post down now</p>
          <p>
            The post is live, unapproved, and cannot be edited into compliance in place. Supervision
            follow-up is the CCO’s; it is flagged, not handled, by this review.
          </p>
        </div>
      ) : null}

      {useMarkedScreenshots ? (
        <PresentationDeliverable
          name={
            detail?.name ||
            (isPresentation
              ? "Pitch deck"
              : isEmail
                ? "Email"
                : isImageCapture
                  ? detail?.format === "social"
                    ? "Social post"
                    : "Screenshot"
                  : screenshotFormat === "blog"
                    ? "Article/Blog"
                    : "Homepage")
          }
          findings={openFindings}
          layoutNotes={visualNotes}
          selected={selected}
          transcribing={pending}
          variant={
            isPresentation
              ? "presentation"
              : isEmail || isImageCapture
                ? "email"
                : screenshotFormat || "webpage"
          }
          onSelect={(findingId, option) =>
            setSelected((current) => ({ ...current, [findingId]: option }))
          }
          cosineRules={review.rule_versions?.cosine_similarity?.rules}
          reviewedAt={review.created_at ? new Date(review.created_at).toLocaleDateString() : undefined}
          pageUrl={detail?.source_url}
          pageText={detail?.body_text}
          htmlPreview={detail?.html_preview}
        />
      ) : (
      <div className={VISUAL_PASS_FORMATS.has(detail?.format || "") ? "grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]" : "min-w-0 space-y-4"}>
        {VISUAL_PASS_FORMATS.has(detail?.format || "") && visualNotes.length > 0 ? (
          <section className="min-w-0 space-y-2 overflow-hidden">
            <h3 className="text-sm font-semibold">Visual pass</h3>
            <div className="space-y-3 overflow-hidden rounded-md border p-3">
              {visualNotes.map((note, index) => (
                <div key={`${note.region || "region"}-${index}`} className="min-w-0 space-y-1 border-b pb-3 last:border-b-0 last:pb-0">
                  <p className="text-xs font-semibold uppercase tracking-wide">
                  {detail?.format === "blog"
                    ? blogRegionLabel(note)
                    : detail?.format === "presentation"
                      ? presentationRegionLabel(note)
                      : (note.region || "region").replace(/_/g, " ")}
                    {note.page && detail?.format === "presentation" && !String(note.region || "").startsWith("slide_or_page_")
                      ? ` · slide ${note.page}`
                      : ""}
                    {note.below_fold && detail?.format !== "presentation" ? " · below the fold" : ""}
                  </p>
                  {note.font_note ? (
                    <p className={`text-xs text-muted-foreground ${wrapClass(note.font_note)}`}>
                      {note.font_note}
                    </p>
                  ) : null}
                  {note.excerpt ? (
                    <p
                      className={`text-sm ${detail?.format === "email" ? "whitespace-pre-wrap" : ""} ${wrapClass(note.excerpt)}`}
                    >
                      {note.excerpt}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="min-w-0 space-y-3 overflow-hidden">
          <h3 className="text-sm font-semibold">
            {detail?.format === "presentation" ? "First pass" : "Keyed findings for CCO consideration"}
          </h3>
          {openFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No findings yet.</p>
          ) : (
            openFindings.map((finding, index) => {
              const findingId = finding.id || "";
              const marker = finding.marker || index + 1;
              const draft =
                finding.draft_text ||
                String(
                  (review.change_list || []).find(
                    (item) => item.finding_id === findingId || Number(item.marker) === marker
                  )?.draft_text || ""
                );
              return (
                <article key={findingId || finding.excerpt} className="min-w-0 space-y-2 overflow-hidden rounded-md border p-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive text-xs font-semibold text-destructive-foreground">
                      {marker}
                    </span>
                    <p className={`min-w-0 flex-1 text-sm font-medium ${wrapClass(finding.title || finding.excerpt || "")}`}>
                      {detail?.format === "email"
                        ? emailFindingHeading(finding, marker)
                        : finding.title || finding.excerpt}
                    </p>
                    {finding.rule ? <Badge variant="outline">{finding.rule}</Badge> : null}
                    {finding.status === "held" ? <Badge variant="outline">Held</Badge> : null}
                  </div>
                  {detail?.format === "email" && finding.title && finding.id !== "sequence_flag" ? (
                    <p className={`text-xs text-muted-foreground ${wrapClass(finding.title)}`}>{finding.title}</p>
                  ) : finding.title && finding.excerpt ? (
                    <p className={`text-xs text-muted-foreground ${wrapClass(finding.excerpt)}`}>{finding.excerpt}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {finding.confidence?.replace(/_/g, " ")}
                  </p>
                  <p className={`text-sm ${WRAP_TEXT}`}>{finding.why}</p>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {(finding.options || OPTIONS.map((item) => item.value))
                      .filter((option) => option !== "held")
                      .map((option) => {
                        const isRecommended = finding.recommended_option === option;
                        const label =
                          finding.option_labels?.[option] ||
                          OPTIONS.find((item) => item.value === option)?.label ||
                          option;
                        return (
                          <Button
                            key={option}
                            type="button"
                            size="sm"
                            variant={selected[findingId] === option ? "default" : "outline"}
                            className={`max-w-full whitespace-normal ${isRecommended && selected[findingId] !== option ? "border-foreground" : ""}`}
                            onClick={() =>
                              setSelected((current) => ({ ...current, [findingId]: option }))
                            }
                          >
                            {label}
                            {isRecommended ? " — recommended" : ""}
                          </Button>
                        );
                      })}
                  </div>
                  {draft ? (
                    <div className="min-w-0 overflow-hidden rounded-md bg-muted/60 p-2 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft</p>
                      <p className={WRAP_TEXT}>{draft}</p>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </div>
      )}

      <p className="text-xs text-muted-foreground">
        {isPresentation
          ? "This is a review for the CCO’s consideration. It is not an approval. Delivered as an edited deck — each change is accept/reject. Review artifact saved (SEC 204-2). Nothing goes out until the CCO signs off."
          : isEmail || isImageCapture
            ? "This is a review for the CCO’s consideration. It is not an approval. Numbered markers on the screenshot correspond to the keyed findings. Review artifact saved (SEC 204-2). Nothing goes out until the CCO signs off."
          : useMarkedScreenshots
            ? "This is a review for the CCO’s consideration. It is not an approval. Numbered markers on the scraped page correspond to the keyed findings. Review artifact saved (SEC 204-2). Nothing goes out until the CCO signs off."
            : "This is a review for the CCO’s consideration. Send to CCO Review records the selected options, writes a Gap Analysis, and opens a CCO Review Queue item with a RULE / GAP / FIX redline of this content versus the indicated SEC and FINRA rules. Nothing is published until that review is finished."}
      </p>

      {review.status === "signed_off" ? (
        <p className="text-sm text-muted-foreground">
          Sent to CCO Review. Download the redline here, or open the{" "}
          <Link href="/reviews" className="underline underline-offset-2">
            CCO Review Queue
          </Link>
          .
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => void signOff()}
          disabled={blocksSignOff}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {review.status === "signed_off" ? "Sent to CCO Review" : "Send to CCO Review"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="relative border-foreground"
          onClick={() => void downloadRedlineDoc()}
          disabled={
            isSaving ||
            isDownloadingRedline ||
            pending ||
            (review.status === "awaiting_answers" && unansweredRequired.length > 0)
          }
        >
          {isDownloadingRedline ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {isDownloadingRedline ? "Preparing redline..." : "Check Redline Doc"}
        </Button>
      </div>
    </div>
  );
}
