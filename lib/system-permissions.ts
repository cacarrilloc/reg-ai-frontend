/**
 * System roles + System permissions (Member Permissions catalog).
 *
 * Counts: Master 9 · Product Manager 2 · Nominated 1 · CCO 3
 * Developer User was removed (Dev/Staging/Production orgs replace it).
 */

import { MANAGE_NEWSLETTER_SUBSCRIBERS, memberCan } from "@/lib/member-capabilities";

export const SYSTEM_PERMISSIONS = [
  {
    key: "org:sys_profile:manage",
    name: "Manage organization",
    description: "Update organization profile and settings.",
    group: "organization",
  },
  {
    key: "org:sys_profile:delete",
    name: "Delete organization",
    description: "Permanently delete the organization.",
    group: "organization",
  },
  {
    key: "org:sys_billing:read",
    name: "Read billing",
    description: "View subscription and billing information.",
    group: "billing",
  },
  {
    key: "org:sys_billing:manage",
    name: "Manage billing",
    description: "Change subscription plans and billing settings.",
    group: "billing",
  },
  {
    key: "org:sys_domains:read",
    name: "Read domains",
    description: "View verified organization domains.",
    group: "domains",
  },
  {
    key: "org:sys_domains:manage",
    name: "Manage domains",
    description: "Add, verify, and remove organization domains.",
    group: "domains",
  },
  {
    key: "org:sys_sso:manage",
    name: "Manage enterprise connections",
    description: "Configure SSO / enterprise identity connections.",
    group: "connections",
  },
  {
    key: "org:sys_memberships:read",
    name: "Read members",
    description: "View organization members and invitations.",
    group: "members",
  },
  {
    key: "org:sys_memberships:manage",
    name: "Manage members",
    description: "Invite, remove, and change member roles.",
    group: "members",
  },
] as const;

export type SystemPermissionKey = (typeof SYSTEM_PERMISSIONS)[number]["key"];

export const SYSTEM_ROLES = [
  {
    key: "org:master_user",
    value: "master_user",
    label: "Master User",
    description:
      "Internal in-house role with full platform access. Platform-wide configuration; sets up client orgs; manages internal team access; highest authority.",
    permissionCount: 9,
  },
  {
    key: "org:product_manager",
    value: "product_manager",
    label: "Product Manager",
    description:
      "Internal product/client view. Monitors client health; reviews agent outputs; manages product roadmap inputs.",
    permissionCount: 2,
  },
  {
    key: "org:chief_compliance_officer",
    value: "chief_compliance_officer",
    label: "Chief Compliance Officer",
    description:
      "Customer CCO with full firm access. Receives redlines; accepts/rejects policy changes; configures approval chain and SLAs; views Audit History.",
    permissionCount: 3,
  },
  {
    key: "org:nominated_team_member",
    value: "nominated_team_member",
    label: "Nominated Team Member",
    description:
      "Customer reviewer scoped by CCO config. Assigned reviewer for specific policy types; receives routed redlines; approves within delegated authority.",
    permissionCount: 1,
  },
] as const;

export type ProductRole = (typeof SYSTEM_ROLES)[number]["value"];

export const ROLE_SYSTEM_PERMISSIONS: Record<ProductRole, readonly SystemPermissionKey[]> = {
  master_user: SYSTEM_PERMISSIONS.map((item) => item.key),
  product_manager: ["org:sys_billing:read", "org:sys_memberships:read"],
  chief_compliance_officer: [
    "org:sys_profile:manage",
    "org:sys_memberships:read",
    "org:sys_memberships:manage",
  ],
  nominated_team_member: ["org:sys_memberships:read"],
};

/** Invite dropdown for all orgs — Master, Product Manager, CCO, Nominated. */
export const INVITE_ROLES = SYSTEM_ROLES.map((role) => ({
  value: role.value,
  label: role.label,
  description: role.description,
}));

/** @deprecated Use INVITE_ROLES — customer orgs may invite Master + PM too. */
export const CUSTOMER_INVITE_ROLES = INVITE_ROLES;

/** @deprecated Use INVITE_ROLES */
export const INTERNAL_INVITE_ROLES = INVITE_ROLES;

export type InviteRole = (typeof INVITE_ROLES)[number]["value"];
export type CustomerInviteRole = InviteRole;
export type InternalInviteRole = InviteRole;

/** Fixed auth org ids for IPX Development / Staging / Production. */
export const RESERVED_INTERNAL_ORG_IDS = [
  "org_internal_development",
  "org_internal_staging",
  "org_internal_production",
] as const;

export function isReservedInternalOrgId(orgId: string | null | undefined): boolean {
  const normalized = (orgId || "").trim();
  return (RESERVED_INTERNAL_ORG_IDS as readonly string[]).includes(normalized);
}

export function reservedInternalOrgName(orgId: string | null | undefined): string | null {
  switch ((orgId || "").trim()) {
    case "org_internal_development":
      return "Development";
    case "org_internal_staging":
      return "Staging";
    case "org_internal_production":
      return "Production";
    default:
      return null;
  }
}

export function inviteRolesForOrg(orgId?: string | null) {
  void orgId;
  return INVITE_ROLES;
}

export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) {
    return "No role";
  }
  if (role === "developer_user" || role === "org:developer_user") {
    return "Master User";
  }
  const match = SYSTEM_ROLES.find((option) => option.value === role || option.key === role);
  if (match) {
    return match.label;
  }
  return role.replace(/_/g, " ");
}

export function canViewMemberPermissions(options: {
  orgId: string | null | undefined;
  role: string | null | undefined;
}): boolean {
  // Dev/Staging/Production: every member can open Member Permissions.
  if (isReservedInternalOrgId(options.orgId)) {
    return true;
  }
  const role = (options.role || "").replace(/^org:/, "");
  return role === "master_user";
}

export function canEditMemberPermissions(options: {
  orgId: string | null | undefined;
  role: string | null | undefined;
}): boolean {
  // Dev/Staging/Production: every member can edit role defaults and per-member overrides.
  if (isReservedInternalOrgId(options.orgId)) {
    return true;
  }
  const role = (options.role || "").replace(/^org:/, "");
  return role === "master_user";
}

export function canManageOrgNewsletterSubscribers(options: {
  role: string | null | undefined;
  canManage?: boolean | null;
  capabilities?: readonly string[] | null;
}): boolean {
  if (options.canManage === true) {
    return true;
  }
  if (options.canManage === false) {
    return false;
  }
  return memberCan(options.role, MANAGE_NEWSLETTER_SUBSCRIBERS, options.capabilities);
}

/** @deprecated Prefer canViewMemberPermissions / canEditMemberPermissions */
export function canManageMemberPermissions(options: {
  orgId: string | null | undefined;
  role: string | null | undefined;
}): boolean {
  return canViewMemberPermissions(options);
}

export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  organization: "Organization",
  billing: "Billing",
  domains: "Domains",
  connections: "Connections",
  members: "Memberships",
  enterprise: "Connections",
};
