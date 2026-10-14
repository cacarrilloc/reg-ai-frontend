import { MemberPermissionsWorkspace } from "@/components/settings/member-permissions-workspace";
import { DashboardShell } from "@/components/dashboard/shell";

export default function MemberPermissionsPage() {
  return (
    <DashboardShell
      title="Member Permissions"
      description="Configure System permissions for each organization role."
    >
      <MemberPermissionsWorkspace />
    </DashboardShell>
  );
}
