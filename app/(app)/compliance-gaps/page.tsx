import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { ComplianceGapsWorkspace } from "@/components/gap-analyses/compliance-gaps-workspace";

export default function ComplianceGapsPage() {
  return (
    <DashboardShell
      title="Compliance Gaps"
      description="Review policy impacts from regulatory publications and business changes, then work marketing findings in Marketing Gaps."
    >
      <Suspense fallback={null}>
        <ComplianceGapsWorkspace />
      </Suspense>
    </DashboardShell>
  );
}
