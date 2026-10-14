import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { OrganizationWorkspacePicker } from "@/components/auth/organization-workspace-picker";

export default function OrganizationsPage() {
  return (
    <AuthPageShell title="Organizations" className="max-w-2xl">
      <OrganizationWorkspacePicker nextPath="/dashboard" />
    </AuthPageShell>
  );
}
