"use client";

import { useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, Download, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  analysisDownloadButtonLabel,
  canDownloadAnalysis,
  formatAnalysisStatus,
  isAnalysisInProgress
} from "@/lib/business-change-analysis";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EventSummaryMarkdown } from "@/components/business-changes/event-summary-markdown";
import { invalidateCache } from "@/lib/api-cache";

type BusinessChangeResponse = {
  id: string;
  org_id: string;
  change_type: string;
  description: string;
  change_date: string | null;
  triggers_review: boolean;
  assessment_rationale: string;
  event_summary: string;
  assessment_mode: "LLM" | "RULE_FALLBACK" | "FAIL_SAFE";
  persisted: boolean;
  event_emitted: boolean;
  analysis_status: "PENDING" | "GENERATING" | "READY" | "FAILED" | string;
  analysis_generated_at: string | null;
};

type BusinessChangeStatusItem = Pick<BusinessChangeResponse, "id" | "analysis_status" | "analysis_generated_at">;

type BusinessChangeFieldsProps = {
  orgId?: string | null;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
};

const changeTypes = [
  { value: "NEW_PRODUCT", label: "New product" },
  { value: "NEW_PROCESS", label: "New process" },
  { value: "NEW_HIRE", label: "New hire" },
  { value: "NEW_MARKET", label: "New market" },
  { value: "OTHER", label: "Other" }
];

function submissionStatusMessage(result: BusinessChangeResponse): string {
  const logged = result.persisted ? "Change logged." : "Change assessed in local mode.";
  if (result.event_emitted) {
    return `${logged} A regulatory analysis document is being prepared from matched government references.`;
  }
  return `${logged} Workflow delivery is pending; the analysis document will generate once processing starts.`;
}

function submissionSummaryText(result: BusinessChangeResponse): string {
  return result.event_summary.trim() || result.assessment_rationale.trim();
}

function SubmissionResultBanner({
  result,
  onDownloadAnalysis,
  onRetryAnalysis,
  isDownloading
}: {
  result: BusinessChangeResponse;
  onDownloadAnalysis: () => void;
  onRetryAnalysis?: () => void;
  isDownloading: boolean;
}) {
  const summary = submissionSummaryText(result);

  return (
    <div className="grid gap-2 border-l-2 border-primary pl-3 text-sm text-muted-foreground" role="status">
      <p className="font-medium text-foreground">{submissionStatusMessage(result)}</p>
      <p className="text-xs uppercase tracking-wide">
        Analysis status: {formatAnalysisStatus(result.analysis_status)}
      </p>
      {summary ? (
        <div className="mt-1 min-w-0 rounded-md border border-border/60 bg-muted/20 p-3">
          <EventSummaryMarkdown text={summary} />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit gap-2"
          onClick={onDownloadAnalysis}
          disabled={!canDownloadAnalysis(result.analysis_status) || isDownloading}
        >
          {isDownloading || isAnalysisInProgress(result.analysis_status) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {analysisDownloadButtonLabel(result.analysis_status, isDownloading)}
        </Button>
        {result.analysis_status !== "READY" && onRetryAnalysis ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetryAnalysis}>
            Retry generation
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function BusinessChangeForm() {
  if (!isAuthConfigured()) {
    return <BusinessChangeFields orgId={getLocalDevOrgId()} />;
  }

  return <AuthedBusinessChangeFields />;
}

function AuthedBusinessChangeFields() {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return <BusinessChangeFields orgId={orgId} authState={authState} getAuthToken={getAuthToken} />;
}

function BusinessChangeFields({ orgId, authState = "ready", getAuthToken }: BusinessChangeFieldsProps) {
  const [changeType, setChangeType] = useState(changeTypes[0].value);
  const [description, setDescription] = useState("");
  const [changeDate, setChangeDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [result, setResult] = useState<BusinessChangeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSubmittedChange = useCallback(async () => {
    if (!result) {
      return;
    }
    const token = getAuthToken ? await getAuthToken() : null;
    const updated = await apiFetch<BusinessChangeStatusItem>(
      `/api/v1/business-changes/${result.id}`,
      undefined,
      { token, orgId }
    );
    const previousStatus = result.analysis_status;
    setResult((current) =>
      current
        ? {
            ...current,
            analysis_status: updated.analysis_status,
            analysis_generated_at: updated.analysis_generated_at
          }
        : null
    );
    if (
      isAnalysisInProgress(previousStatus)
      && !isAnalysisInProgress(updated.analysis_status)
    ) {
      invalidateCache("/api/v1/gap-analyses");
    }
  }, [getAuthToken, orgId, result]);

  useEffect(() => {
    if (!result?.id || !isAnalysisInProgress(result.analysis_status) || authState !== "ready") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshSubmittedChange().catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Unable to refresh analysis status.");
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [authState, refreshSubmittedChange, result?.analysis_status, result?.id]);

  async function retryAnalysisGeneration() {
    if (!result?.id) {
      setError("Unable to retry analysis generation.");
      return;
    }
    setIsRetrying(true);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        `/api/v1/business-changes/${result.id}/generate-analysis`,
        { method: "POST" },
        { token, orgId }
      );
      invalidateCache("/api/v1/gap-analyses");
      await refreshSubmittedChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to retry analysis generation.");
    } finally {
      setIsRetrying(false);
    }
  }

  async function downloadAnalysis(changeId: string) {
    setIsDownloading(true);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to download the regulatory analysis document.");
      }
      const response = await apiFetch<{ download_url: string }>(
        `/api/v1/business-changes/${changeId}/analysis`,
        undefined,
        { token, orgId }
      );
      window.open(response.download_url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download regulatory analysis.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authState === "loading") {
      setError("Authentication is still loading.");
      return;
    }
    if (authState === "signed-out") {
      setError("Sign in to submit a business change.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Describe the change in at least 10 characters.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        setError("Sign in to submit a business change.");
        return;
      }
      const payload = {
        change_type: changeType,
        description: description.trim(),
        change_date: changeDate || null
      };
      const response = await apiFetch<BusinessChangeResponse>(
        "/api/v1/business-changes",
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId() }
        },
        { token, orgId }
      );

      setResult(response);
      invalidateCache("/api/v1/gap-analyses");
      setDescription("");
      setChangeDate("");
      setChangeType(changeTypes[0].value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit business change.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BriefcaseBusiness className="h-5 w-5" />
          Create Business Change
        </CardTitle>
        <CardDescription>
          Capture internal events and receive an AI regulatory analysis grounded in matched government references.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="change-type">Change type</Label>
            <select
              id="change-type"
              value={changeType}
              onChange={(event) => setChangeType(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {changeTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="change-date">Effective date</Label>
            <Input
              id="change-date"
              type="date"
              value={changeDate}
              onChange={(event) => setChangeDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="change-description">Description</Label>
            <Textarea
              id="change-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the operational change, impacted team, product, or process."
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {result ? (
            <SubmissionResultBanner
              result={result}
              onDownloadAnalysis={() => void downloadAnalysis(result.id)}
              onRetryAnalysis={isRetrying ? undefined : () => void retryAnalysisGeneration()}
              isDownloading={isDownloading}
            />
          ) : null}
          <Button type="submit" disabled={isSubmitting || authState !== "ready"} className="w-fit gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}
            Submit change
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
