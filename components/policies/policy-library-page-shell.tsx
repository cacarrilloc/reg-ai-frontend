"use client";

import { useState, type ReactNode } from "react";
import { FileText, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { apiFetch } from "@/lib/api";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PolicyLibraryPageShell({ children }: { children: ReactNode }) {
  if (!isAuthConfigured()) {
    return <PolicyLibraryPageShellContent orgId={getLocalDevOrgId()}>{children}</PolicyLibraryPageShellContent>;
  }
  return <AuthedPolicyLibraryPageShell>{children}</AuthedPolicyLibraryPageShell>;
}

function AuthedPolicyLibraryPageShell({ children }: { children: ReactNode }) {
  const { authState, getAuthToken, orgId } = useBackendAuth();
  return (
    <PolicyLibraryPageShellContent authState={authState} getAuthToken={getAuthToken} orgId={orgId}>
      {children}
    </PolicyLibraryPageShellContent>
  );
}

function PolicyLibraryPageShellContent({
  children,
  orgId,
  authState = "ready",
  getAuthToken,
}: {
  children: ReactNode;
  orgId?: string | null;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
}) {
  return (
    <DashboardShell
      title="Policy Library"
      description="Upload, version, and retrieve firm policies and onboarding context."
      headerExtra={
        <ComplianceReportCard orgId={orgId} authState={authState} getAuthToken={getAuthToken} />
      }
    >
      {children}
    </DashboardShell>
  );
}

function ComplianceReportCard({
  orgId,
  authState = "ready",
  getAuthToken,
}: {
  orgId?: string | null;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateReport() {
    if (authState !== "ready") {
      return;
    }
    setIsGenerating(true);
    setMessage(null);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await apiFetch<{
        download_url: string;
        policy_count: number;
        gap_count: number;
        compliance_status: string;
        compliance_score: number;
      }>("/api/v1/policies/compliance-report", { method: "POST" }, { token, orgId });
      window.open(response.download_url, "_blank", "noopener,noreferrer");
      setMessage(
        `Report generated: ${response.compliance_score.toFixed(1)}% Compliance — ${response.compliance_status}. ` +
          `It covers ${response.policy_count} active internal policies and all ${response.gap_count} open material gap(s).`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate compliance report.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card className="rounded-t-none shadow-none">
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Full Library Compliance Report
          </CardTitle>
          <CardDescription className="mt-2">
            Generate a DOCX snapshot with the current overall compliance status and score, active
            internal policy inventory, and the complete open HIGH and MEDIUM gap register.
          </CardDescription>
        </div>
        <Button
          className="shrink-0 gap-2"
          onClick={() => void generateReport()}
          disabled={isGenerating || authState !== "ready"}
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Generate report
        </Button>
      </CardHeader>
      {message || error ? (
        <CardContent>
          {message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
