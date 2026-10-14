"use client";

import { useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const contextDocumentTypes = [
  {
    value: "PRIOR_EXAM_RESPONSE",
    label: "Prior exam response",
    description: "Optional examination context, including redacted regulatory responses."
  },
  {
    value: "REPORTING_HISTORY",
    label: "Reporting history",
    description: "Optional filing and reporting history used as compliance context."
  },
  {
    value: "VIOLATION_HISTORY",
    label: "Violation history",
    description: "Optional known violations, remediation records, and identified gaps."
  }
] as const;

type ContextDocumentUploadResponse = {
  context_document_id: string;
  filename: string;
  document_type: string;
  status: string;
  persisted: boolean;
};

type ContextDocumentUploadFormProps = {
  documentType: (typeof contextDocumentTypes)[number]["value"];
  onUploaded?: () => void;
};

type ContextDocumentUploadFieldsProps = Omit<ContextDocumentUploadFormProps, "onUploaded"> & {
  orgId?: string | null;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  onUploaded?: () => void;
};

export function ContextDocumentUploadForm({ documentType, onUploaded }: ContextDocumentUploadFormProps) {
  if (!isAuthConfigured()) {
    return <ContextDocumentUploadFields documentType={documentType} orgId={getLocalDevOrgId()} onUploaded={onUploaded} />;
  }

  return <AuthedContextDocumentUploadFields documentType={documentType} onUploaded={onUploaded} />;
}

function AuthedContextDocumentUploadFields({ documentType, onUploaded }: ContextDocumentUploadFormProps) {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <ContextDocumentUploadFields
      documentType={documentType}
      orgId={orgId}
      authState={authState}
      getAuthToken={getAuthToken}
      onUploaded={onUploaded}
    />
  );
}

function ContextDocumentUploadFields({
  documentType,
  orgId,
  authState = "ready",
  getAuthToken,
  onUploaded,
}: ContextDocumentUploadFieldsProps) {
  const config = contextDocumentTypes.find((item) => item.value === documentType)!;
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ContextDocumentUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (authState === "loading") {
      setError("Authentication is still loading.");
      return;
    }
    if (authState === "signed-out") {
      setError("Sign in to upload onboarding context.");
      return;
    }
    if (!file) {
      setError("Choose a PDF or Word document.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        setError("Sign in to upload onboarding context.");
        return;
      }
      const response = await apiFetch<ContextDocumentUploadResponse>(
        `/api/v1/context-documents/${documentType}/upload`,
        {
          method: "POST",
          body: formData,
          headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId() }
        },
        { token, orgId }
      );
      setResult(response);
      setFile(null);
      form.reset();
      onUploaded?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload onboarding context.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePlus2 className="h-4 w-4" />
          {config.label}
        </CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor={`context-${documentType}`}>Document</Label>
            <Input
              id={`context-${documentType}`}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {result ? (
            <p className="text-sm text-muted-foreground">
              {result.filename} is {result.persisted ? "stored" : "processed locally"} ({result.status.replaceAll("_", " ")}).
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={isSubmitting || authState !== "ready"} className="w-fit gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            Upload
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
