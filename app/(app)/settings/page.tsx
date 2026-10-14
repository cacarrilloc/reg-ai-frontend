import { DashboardShell } from "@/components/dashboard/shell";
import { AIModelSelectionCard } from "@/components/settings/ai-model-selection-card";
import { ApprovalChainForm } from "@/components/settings/approval-chain-form";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { DeleteOrganizationCard } from "@/components/settings/delete-organization-card";
import { IntegrationsStatusCard } from "@/components/settings/integrations-status-card";
import { MemberPermissionsSection } from "@/components/settings/member-permissions-section";
import { OrganizationMemberPermissionsSection } from "@/components/settings/organization-member-permissions-section";
import { MfaSettingsCard } from "@/components/settings/mfa-settings-card";
import { PasswordSettingsCard } from "@/components/settings/password-settings-card";
import { isMfaRequired } from "@/lib/mfa-config";
import { OrganizationMembersInviteCard } from "@/components/settings/organization-members-invite-card";
import { OrganizationNewsletterSubscribersCard } from "@/components/settings/organization-newsletter-subscribers-card";
import { OrganizationSettingsForm } from "@/components/settings/organization-settings-form";
import { SsoSettingsCard } from "@/components/settings/sso-settings-card";

export default function SettingsPage() {
  return (
    <DashboardShell
      title="Organization Settings"
      description="Configure regulatory scope, CCO contacts, approval routing, and reviewer roles for this organization."
    >
      <div className="space-y-6">
        <OrganizationSettingsForm />
        <AIModelSelectionCard />
        <OrganizationMembersInviteCard />
        <OrganizationNewsletterSubscribersCard />
        <MemberPermissionsSection />
        <OrganizationMemberPermissionsSection />
        <ApprovalChainForm />
        <BillingSettingsCard />
        <PasswordSettingsCard />
        <MfaSettingsCard required={isMfaRequired()} />
        <SsoSettingsCard />
        <IntegrationsStatusCard />
        <DeleteOrganizationCard />
      </div>
    </DashboardShell>
  );
}
