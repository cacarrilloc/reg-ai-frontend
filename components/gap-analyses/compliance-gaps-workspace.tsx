"use client";

import { GapAnalysisSummary } from "@/components/gap-analyses/gap-analysis-summary";
import { MarketingContentList } from "@/components/marketing/marketing-content-list";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";

export function ComplianceGapsWorkspace() {
  if (!isAuthConfigured()) {
    return <ComplianceGapsWorkspaceContent orgId={getLocalDevOrgId()} />;
  }
  return <AuthedComplianceGapsWorkspace />;
}

function AuthedComplianceGapsWorkspace() {
  const { authState, getAuthToken, orgId } = useBackendAuth();
  return (
    <ComplianceGapsWorkspaceContent
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
    />
  );
}

function ComplianceGapsWorkspaceContent({
  authState = "ready",
  getAuthToken,
  orgId,
}: {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
}) {
  return (
    <div className="space-y-6">
      <GapAnalysisSummary />
      <MarketingContentList authState={authState} getAuthToken={getAuthToken} orgId={orgId} />
    </div>
  );
}
