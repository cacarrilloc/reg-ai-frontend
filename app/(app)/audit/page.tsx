import { AuditTrailWorkspace } from "@/components/audit/audit-trail-workspace";
import { DashboardShell } from "@/components/dashboard/shell";

export default function AuditPage() {
  return (
    <DashboardShell title="Audit History" description="Explore compliance evidence, change history, and approvals.">
      <AuditTrailWorkspace />
    </DashboardShell>
  );
}
