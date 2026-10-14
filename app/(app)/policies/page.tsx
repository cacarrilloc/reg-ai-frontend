import { PolicyLibraryPageShell } from "@/components/policies/policy-library-page-shell";
import { PolicyLibraryWorkspace } from "@/components/policies/policy-library-workspace";

export default function PoliciesPage() {
  return (
    <PolicyLibraryPageShell>
      <PolicyLibraryWorkspace />
    </PolicyLibraryPageShell>
  );
}
