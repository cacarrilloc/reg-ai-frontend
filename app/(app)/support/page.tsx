"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { CrispChatScript } from "@/components/support/crisp-chat-script";
import { SupportTicketForm } from "@/components/support/support-ticket-form";
import { SupportTicketList } from "@/components/support/support-ticket-list";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useBackendAuth } from "@/lib/use-backend-auth";

export default function SupportPage() {
  if (!isAuthConfigured()) {
    return <SupportPageContent orgId={getLocalDevOrgId()} />;
  }
  return <AuthedSupportPage />;
}

function AuthedSupportPage() {
  const { authState, getAuthToken, orgId } = useBackendAuth();
  return <SupportPageContent authState={authState} getAuthToken={getAuthToken} orgId={orgId} />;
}

function SupportPageContent({
  authState = "ready",
  getAuthToken,
  orgId
}: {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <DashboardShell title="Support" description="Get help from the Reg-AI team.">
      <CrispChatScript />
      <div className="space-y-6">
        <SupportTicketList authState={authState} getAuthToken={getAuthToken} orgId={orgId} refreshKey={refreshKey} />
        <SupportTicketForm
          authState={authState}
          getAuthToken={getAuthToken}
          orgId={orgId}
          onSubmitted={() => setRefreshKey((current) => current + 1)}
        />
      </div>
    </DashboardShell>
  );
}
