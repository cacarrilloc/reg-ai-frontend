"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, FileUp, Loader2, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { invalidateCache } from "@/lib/api-cache";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PolicyUploadResponse = {
  policy_id: string;
  org_id: string;
  filename: string;
  status: string;
  version: number;
  persisted: boolean;
  chunk_count: number;
  embedded_chunk_count: number;
  embedding_model: string | null;
};

type PolicyNameMatch = {
  id: string;
  name: string;
  version: number;
  status: string;
  version_count: number;
};

type PolicyNameSuggestion = {
  id: string;
  name: string;
  version: number;
  similarity: number;
};

type PolicyNameCheckResponse = {
  normalized_name: string;
  exact_match: PolicyNameMatch | null;
  similar_names: PolicyNameSuggestion[];
};

type PolicyUploadFormProps = {
  onUploaded?: () => void;
};

type PolicyUploadFieldsProps = {
  orgId?: string | null;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  onUploaded?: () => void;
};

export function PolicyUploadForm({ onUploaded }: PolicyUploadFormProps) {
  if (!isAuthConfigured()) {
    return <PolicyUploadFields orgId={getLocalDevOrgId()} onUploaded={onUploaded} />;
  }

  return <AuthedPolicyUploadFields onUploaded={onUploaded} />;
}

function AuthedPolicyUploadFields({ onUploaded }: PolicyUploadFormProps) {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <PolicyUploadFields orgId={orgId} authState={authState} getAuthToken={getAuthToken} onUploaded={onUploaded} />
  );
}

function PolicyUploadFields({ orgId, authState = "ready", getAuthToken, onUploaded }: PolicyUploadFieldsProps) {
  const searchParams = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [policyName, setPolicyName] = useState("");
  const [confirmedPolicyName, setConfirmedPolicyName] = useState("");
  const [nameCheck, setNameCheck] = useState<PolicyNameCheckResponse | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PolicyUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requested = (searchParams.get("policy_name") || "").trim();
    if (requested) {
      setPolicyName(requested);
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("upload") !== "1") {
      return;
    }
    const section = document.getElementById("policy-upload-section");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams]);

  async function checkName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedName = policyName.trim();
    if (!requestedName) {
      setError("Enter a policy name.");
      return;
    }
    if (authState !== "ready") {
      setError(authState === "loading" ? "Authentication is still loading." : "Sign in to check a policy name.");
      return;
    }

    setIsCheckingName(true);
    setNameCheck(null);
    setConfirmedPolicyName("");
    setResult(null);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to check a policy name.");
      }
      const response = await apiFetch<PolicyNameCheckResponse>(
        `/api/v1/policies/name-check?name=${encodeURIComponent(requestedName)}`,
        { headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId() } },
        { token, orgId }
      );
      setNameCheck(response);
      if (response.exact_match) {
        setConfirmedPolicyName(response.exact_match.name);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to check the policy name.");
    } finally {
      setIsCheckingName(false);
    }
  }

  function openUpload(policyNameToUse: string) {
    setConfirmedPolicyName(policyNameToUse);
    setFile(null);
    setError(null);
    setIsUploadOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (authState === "loading") {
      setError("Authentication is still loading.");
      return;
    }
    if (authState === "signed-out") {
      setError("Sign in to upload a policy document.");
      return;
    }
    if (!file) {
      setError("Choose a PDF or Word policy document.");
      return;
    }
    if (!confirmedPolicyName) {
      setError("Check and confirm the policy name first.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("policy_name", confirmedPolicyName);

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        setError("Sign in to upload a policy document.");
        return;
      }
      const response = await apiFetch<PolicyUploadResponse>(
        "/api/v1/policies/upload",
        {
          method: "POST",
          body: formData,
          headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId() }
        },
        { token, orgId }
      );
      setResult(response);
      setFile(null);
      setPolicyName("");
      setConfirmedPolicyName("");
      setNameCheck(null);
      setIsUploadOpen(false);
      form.reset();
      invalidateCache("/api/v1/gap-analyses");
      invalidateCache("/api/v1/policies");
      invalidateCache("/api/v1/reviews/pending");
      onUploaded?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload policy document.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Card id="policy-upload-section">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Upload Policy
          </CardTitle>
          <CardDescription>
            Start by checking the policy name. Reg-AI prevents accidental duplicates before asking
            you to upload the document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={checkName}>
            <div className="grid gap-2">
              <Label htmlFor="policy-name">Policy name</Label>
              <Input
                id="policy-name"
                value={policyName}
                onChange={(event) => {
                  setPolicyName(event.target.value);
                  setNameCheck(null);
                  setConfirmedPolicyName("");
                }}
                placeholder="e.g. Written Supervisory Procedures"
                required
                maxLength={180}
              />
            </div>
            <Button type="submit" disabled={isCheckingName || authState !== "ready"} className="gap-2">
              {isCheckingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Check policy name
            </Button>
          </form>

          {error && !isUploadOpen ? <p className="text-sm text-destructive">{error}</p> : null}

          {nameCheck?.exact_match ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-medium text-emerald-900 dark:text-emerald-100">Policy found</p>
                    <p className="text-sm text-emerald-800 dark:text-emerald-200">
                      {nameCheck.exact_match.name} is currently version {nameCheck.exact_match.version}.
                      The uploaded document will become version {nameCheck.exact_match.version + 1}.
                    </p>
                  </div>
                  <Button type="button" onClick={() => openUpload(nameCheck.exact_match!.name)}>
                    Upload new version
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {nameCheck && !nameCheck.exact_match ? (
            <div className="rounded-md border p-4">
              <p className="font-medium">No exact policy name was found.</p>
              {nameCheck.similar_names.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Review these similar names before creating a new policy:
                  </p>
                  {nameCheck.similar_names.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => openUpload(suggestion.name)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>{suggestion.name}</span>
                      <span className="text-muted-foreground">Use existing · v{suggestion.version}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No similar policy names were found.</p>
              )}
              <Button
                type="button"
                className="mt-4"
                variant={nameCheck.similar_names.length > 0 ? "outline" : "default"}
                onClick={() => openUpload(policyName.trim() || nameCheck.normalized_name)}
              >
                Create “{policyName.trim() || nameCheck.normalized_name}”
              </Button>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              {result.filename} was uploaded as version {result.version}. It is now the latest version
              in the Policy Library. Check for possible compliance gaps on the{" "}
              <Link
                href="/compliance-gaps"
                className="font-medium underline underline-offset-2"
              >
                Compliance Gaps
              </Link>{" "}
              page.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog.Root open={isUploadOpen} onOpenChange={(open) => !isSubmitting && setIsUploadOpen(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold">Upload policy document</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  Upload the document for <strong className="text-foreground">{confirmedPolicyName}</strong>.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="sm" disabled={isSubmitting} aria-label="Close upload">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="policy-file">Policy document</Label>
                <Input
                  id="policy-file"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  required
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button>
                </Dialog.Close>
                <Button type="submit" disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  Upload
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
