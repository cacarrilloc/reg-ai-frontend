"use client";

import Link from "next/link";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { ComplianceHistoryTable } from "@/components/dashboard/compliance-history-table";
import { MarketingUploadForm } from "@/components/marketing/marketing-upload-form";
import { Card, CardContent } from "@/components/ui/card";

export function MarketingReviewWorkspace() {
  if (!isAuthConfigured()) {
    return <MarketingReviewWorkspaceContent orgId={getLocalDevOrgId()} />;
  }
  return <AuthedMarketingReviewWorkspace />;
}

function AuthedMarketingReviewWorkspace() {
  const { authState, getAuthToken, orgId } = useBackendAuth();
  return <MarketingReviewWorkspaceContent authState={authState} getAuthToken={getAuthToken} orgId={orgId} />;
}

function MarketingReviewWorkspaceContent({
  authState = "ready",
  getAuthToken,
  orgId
}: {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <p className="text-sm">
            Submitted reviews appear in{" "}
            <Link href={{ pathname: "/compliance-gaps" }} className="font-medium underline underline-offset-2">
              Compliance Gaps
            </Link>{" "}
            under{" "}
            <Link
              href={{ pathname: "/compliance-gaps", hash: "marketing-gaps" }}
              className="font-medium underline underline-offset-2"
            >
              Marketing Gaps
            </Link>
            .
          </p>
        </CardContent>
      </Card>
      <MarketingUploadForm
        authState={authState}
        getAuthToken={getAuthToken}
        orgId={orgId}
      />
      <ComplianceHistoryTable
        authState={authState}
        getAuthToken={getAuthToken}
        orgId={orgId}
        variant="marketing"
      />
    </div>
  );
}
