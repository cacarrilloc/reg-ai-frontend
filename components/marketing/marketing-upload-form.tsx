"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Megaphone } from "lucide-react";
import { apiFetch, MAX_UPLOAD_MB } from "@/lib/api";
import { putMarketingFileToSignedUrl } from "@/lib/marketing-direct-upload";
import { optimizePptxScreenshots } from "@/lib/optimize-pptx-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const contentTypeGroups = [
  {
    label: "Web link",
    options: [
      { value: "webpage", label: "Homepage" },
      { value: "blog", label: "Article/Blog" },
    ],
  },
  {
    label: "Text or upload",
    options: [
      { value: "social", label: "Social post" },
      { value: "email", label: "Email" },
    ],
  },
  {
    label: "Upload file",
    options: [{ value: "presentation", label: "Presentation/deck" }],
  },
] as const;

type ContentType = (typeof contentTypeGroups)[number]["options"][number]["value"];

const audiences = [
  { value: "unknown", label: "Audience unknown" },
  { value: "retail", label: "Retail" },
  { value: "prospect", label: "Prospect" },
  { value: "institutional", label: "Institutional" },
  { value: "mixed", label: "Mixed" }
];

const registrantTypes = [
  { value: "unknown", label: "Registrant unknown" },
  { value: "ria", label: "RIA" },
  { value: "broker_dealer", label: "Broker-dealer" },
  { value: "dual", label: "Dual" }
];

const selectClassName =
  "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const FILE_ACCEPT =
  ".pdf,.pptx,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/png,image/jpeg";
const EMAIL_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

function fieldsForType(type: ContentType) {
  switch (type) {
    case "webpage":
      return { showUrl: true, showText: false, showFile: false, showEmailForm: false, urlRequired: true };
    case "blog":
      return { showUrl: true, showText: true, showFile: true, showEmailForm: false, urlRequired: false };
    case "social":
      return { showUrl: false, showText: true, showFile: true, showEmailForm: false, urlRequired: false };
    case "email":
      return { showUrl: false, showText: false, showFile: true, showEmailForm: true, urlRequired: false };
    case "presentation":
      return { showUrl: false, showText: false, showFile: true, showEmailForm: false, urlRequired: false };
  }
}

function composeEmailBody(subject: string, body: string, footer: string): string {
  const parts: string[] = [];
  if (subject.trim()) {
    parts.push(`Subject: ${subject.trim()}`);
  }
  if (body.trim()) {
    parts.push(body.trim());
  }
  if (footer.trim()) {
    parts.push(`Footer: ${footer.trim()}`);
  }
  return parts.join("\n\n");
}

function typeCopy(type: ContentType) {
  switch (type) {
    case "webpage":
      return {
        description:
          "Add a title and the public https homepage URL. Reg AI fetches the page, fills the review template, and analyzes it against the SEC/FINRA marketing rule set. The agent never approves the piece.",
        titlePlaceholder: "Firm homepage",
        urlLabel: "Homepage URL",
        urlPlaceholder: "https://www.example.com",
        hint: "RIA uses SEC 206(4)-1 as the primary rule. Broker-dealer adds FINRA 2210 / 2010; 2211–2216 switch on by topic.",
      };
    case "blog":
      return {
        description:
          "Add a title, then paste the article, enter the public https URL, and/or attach a document or screenshot. A URL is scraped into the visual-pass template; pasted or extracted copy is reviewed as submitted. The agent never approves the piece.",
        titlePlaceholder: "Sequence-of-returns article",
        urlLabel: "Article/Blog URL",
        urlPlaceholder: "https://www.example.com/insights/article",
        textLabel: "Article copy",
        textPlaceholder: "Paste the article here…",
        fileLabel: "Or attach a document or screenshot",
        hint: "Educational commentary is outside the Marketing Rule; promotion of the firm’s services is inside it. The agent finds that line within the piece.",
      };
    case "social":
      return {
        description:
          "Paste the post and/or attach a screenshot or document. The agent drafts findings and options for the CCO and never approves the piece.",
        titlePlaceholder: "Q3 LinkedIn campaign",
        textLabel: "Post copy",
        textPlaceholder: "Paste the social post here…",
        fileLabel: "Or attach a file",
        hint: null,
      };
    case "email":
      return {
        description:
          "Fill in the email fields, or attach a screenshot of the send. The agent drafts findings and options for the CCO and never approves the piece.",
        titlePlaceholder: "Prospect email",
        fileLabel: "Or attach a screenshot",
        hint: "Subject and body are required unless you upload a screenshot. Footer is optional. Include the sender signature in the body.",
      };
    case "presentation":
      return {
        description:
          "Attach a PDF or PowerPoint. The agent drafts findings and options for the CCO and never approves the piece.",
        titlePlaceholder: "Pitch deck",
        fileLabel: "Presentation file",
        hint: null,
      };
  }
}

export type MarketingUploadFormProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  onUploaded?: () => void;
};

export function MarketingUploadForm({
  authState = "ready",
  getAuthToken,
  orgId,
  onUploaded
}: MarketingUploadFormProps) {
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("webpage");
  const [audience, setAudience] = useState(audiences[0].value);
  const [registrantType, setRegistrantType] = useState(registrantTypes[0].value);
  const [sourceUrl, setSourceUrl] = useState("");
  const [text, setText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailFooter, setEmailFooter] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);
  const [submittedContentId, setSubmittedContentId] = useState<string | null>(null);

  const fields = fieldsForType(contentType);
  const copy = typeCopy(contentType);

  function handleTypeChange(next: ContentType) {
    setContentType(next);
    setError(null);
    const nextFields = fieldsForType(next);
    if (!nextFields.showUrl) {
      setSourceUrl("");
    }
    if (!nextFields.showText) {
      setText("");
    }
    if (!nextFields.showEmailForm) {
      setEmailSubject("");
      setEmailBody("");
      setEmailFooter("");
    }
    if (!nextFields.showFile) {
      setFile(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authState !== "ready") {
      setError("Sign in to submit marketing content for review.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }
    if (contentType === "webpage" && !sourceUrl.trim()) {
      setError("Add the public https homepage URL.");
      return;
    }
    if (contentType === "blog" && !text.trim() && !sourceUrl.trim() && !file) {
      setError("Paste the article, enter the public https URL, or attach a document or screenshot.");
      return;
    }
    if (contentType === "presentation" && !file) {
      setError("Attach a PDF or PowerPoint.");
      return;
    }
    const emailCopy = composeEmailBody(emailSubject, emailBody, emailFooter);
    if (contentType === "email" && !file && (!emailSubject.trim() || !emailBody.trim())) {
      setError("Add the subject and body, or attach a screenshot of the email.");
      return;
    }
    if (fields.showFile && contentType !== "presentation" && contentType !== "email" && contentType !== "blog" && !text.trim() && !file) {
      setError("Paste the copy or attach a file.");
      return;
    }
    if (file && file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setError(`This file is ${sizeMb} MB. The upload limit is ${MAX_UPLOAD_MB} MB — try a smaller PPTX or PDF.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSubmittedTitle(null);
    setSubmittedContentId(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const formData = new FormData();
      formData.append("format", contentType);
      formData.append("audience", audience);
      formData.append("registrant_type", registrantType);
      formData.append("title", title.trim());
      if (fields.showUrl && sourceUrl.trim()) {
        formData.append("source_url", sourceUrl.trim());
      }
      if (fields.showText && text.trim()) {
        formData.append("body_text", text.trim());
      }
      if (fields.showEmailForm && emailCopy) {
        formData.append("body_text", emailCopy);
      }
      if (fields.showFile && file) {
        const optimized = await optimizePptxScreenshots(file);
        const stored = await putMarketingFileToSignedUrl(optimized, { token, orgId });
        if (stored) {
          formData.append("stored_path", stored.path);
          formData.append("content_id", stored.contentId);
        } else {
          formData.append("file", optimized, optimized.name);
        }
      }
      const created = await apiFetch<{ id: string }>(
        "/api/v1/marketing/contents/upload",
        { method: "POST", body: formData },
        { token, orgId }
      );
      setSubmittedTitle(title.trim() || sourceUrl.trim() || "Homepage");
      setSubmittedContentId(created?.id?.trim() || null);
      setTitle("");
      setText("");
      setEmailSubject("");
      setEmailBody("");
      setEmailFooter("");
      setSourceUrl("");
      setFile(null);
      onUploaded?.();
    } catch (caught) {
      const fallback = caught instanceof Error ? caught.message : "Unable to submit marketing content.";
      if (file && /\b413\b/.test(fallback)) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        setError(
          `This PowerPoint is ${sizeMb} MB because screenshot slides are stored as large images. Hard-refresh the page and try again, or export a compressed PDF.`
        );
      } else {
        setError(fallback);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Submit Marketing Content
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="marketing-title">Title</Label>
              <Input
                id="marketing-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={copy.titlePlaceholder}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="marketing-type">Type</Label>
              <select
                id="marketing-type"
                value={contentType}
                onChange={(event) => handleTypeChange(event.target.value as ContentType)}
                className={selectClassName}
              >
                {contentTypeGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
            <div className="grid gap-2">
              <Label htmlFor="marketing-audience">Audience</Label>
              <select
                id="marketing-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className={selectClassName}
              >
                {audiences.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="marketing-registrant">Registrant</Label>
              <select
                id="marketing-registrant"
                value={registrantType}
                onChange={(event) => setRegistrantType(event.target.value)}
                className={selectClassName}
              >
                {registrantTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {copy.hint ? <p className="text-xs text-muted-foreground">{copy.hint}</p> : null}
          {fields.showUrl ? (
            <div className="grid gap-2">
              <Label htmlFor="marketing-url">{copy.urlLabel}</Label>
              <Input
                id="marketing-url"
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder={copy.urlPlaceholder}
                required={fields.urlRequired}
              />
            </div>
          ) : null}
          {fields.showText ? (
            <div className="grid gap-2">
              <Label htmlFor="marketing-text">{copy.textLabel}</Label>
              <Textarea
                id="marketing-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={copy.textPlaceholder}
              />
            </div>
          ) : null}
          {fields.showEmailForm ? (
            <div className="grid gap-4 rounded-md border p-3">
              <div className="grid gap-2">
                <Label htmlFor="marketing-email-subject">Subject</Label>
                <Input
                  id="marketing-email-subject"
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  placeholder="The subject line as it will appear in the inbox"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="marketing-email-body">Body</Label>
                <Textarea
                  id="marketing-email-body"
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                  placeholder="Include the email copy and the sender signature…"
                  className="min-h-40"
                />
                <p className="text-xs text-muted-foreground">
                  Put the sender signature in this field (name, title, firm, phone).
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="marketing-email-footer">
                  Footer <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="marketing-email-footer"
                  value={emailFooter}
                  onChange={(event) => setEmailFooter(event.target.value)}
                  placeholder="Unsubscribe, firm address, and any footer disclosures…"
                />
              </div>
            </div>
          ) : null}
          {fields.showFile ? (
            <div className="grid gap-2">
              <Label htmlFor="marketing-file">{copy.fileLabel}</Label>
              <Input
                id="marketing-file"
                key={`marketing-file-${contentType}`}
                type="file"
                accept={contentType === "email" ? EMAIL_FILE_ACCEPT : FILE_ACCEPT}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                }}
              />
              {file ? (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                  {contentType === "email"
                    ? ". The screenshot is uploaded directly to storage."
                    : ". Screenshot slides are compressed in the browser, then uploaded directly to storage."}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {contentType === "email"
                    ? `PNG, JPG, or PDF screenshot of the email · up to ${MAX_UPLOAD_MB} MB`
                    : contentType === "blog"
                      ? `PDF, Word, or image screenshot · up to ${MAX_UPLOAD_MB} MB`
                      : `PDF, PowerPoint, Word, or image · up to ${MAX_UPLOAD_MB} MB`}
                </p>
              )}
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {submittedTitle ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {submittedTitle} was submitted to{" "}
              <Link
                href={
                  submittedContentId
                    ? {
                        pathname: "/compliance-gaps",
                        query: { content_id: submittedContentId },
                        hash: `marketing-content-${submittedContentId}`
                      }
                    : { pathname: "/compliance-gaps", hash: "marketing-gaps" }
                }
                className="font-medium underline underline-offset-2"
              >
                Marketing Gaps
              </Link>{" "}
              review list. This is not an approval.
            </p>
          ) : null}
          <Button type="submit" disabled={isSubmitting || authState !== "ready"} className="w-fit gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            Submit for review
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
