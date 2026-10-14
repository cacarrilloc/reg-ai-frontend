import { apiFetch } from "@/lib/api";

export type OrganizationSummary = {
  id: string;
  name: string;
  role?: string;
  status?: string;
  logoUrl?: string | null;
};

export type OrganizationListResponse = {
  organizations: OrganizationSummary[];
};

type BackendOrgSummary = {
  auth_org_id: string;
  name: string;
  role?: string;
  status?: string;
  logo_url?: string | null;
  logo_display_url?: string | null;
};

type BackendOrgListResponse = {
  organizations: BackendOrgSummary[];
};

type BackendOrgCreateResponse = {
  id: string;
  auth_org_id: string;
  name: string;
  slug?: string | null;
  persisted?: boolean;
};

/** List orgs the current user belongs to. */
export const ORGANIZATIONS_MINE_PATH = "/api/v1/organizations/mine";

/** Create a new organization (creator membership as master_user). */
export const ORGANIZATIONS_PATH = "/api/v1/organizations";

/** Switch the active org (updates Supabase app_metadata via backend). */
export const ORGANIZATIONS_SWITCH_PATH = "/api/v1/organizations/switch";

/** Finish the registration AI choice after the org workspace is isolated. */
export const ORGANIZATIONS_CURRENT_AI_SETUP_PATH = "/api/v1/organizations/current/ai-setup";

export const ORGANIZATIONS_CURRENT_LOGO_PATH = "/api/v1/organizations/current/logo";

export function mapOrganizationSummary(org: BackendOrgSummary): OrganizationSummary {
  return {
    id: org.auth_org_id,
    name: org.name,
    role: org.role,
    status: org.status,
    logoUrl: org.logo_display_url || org.logo_url || null,
  };
}

export function mapOrganizationList(response: BackendOrgListResponse): OrganizationListResponse {
  return {
    organizations: (response.organizations ?? []).map(mapOrganizationSummary),
  };
}

export function mapCreatedOrganization(response: BackendOrgCreateResponse): OrganizationSummary {
  return {
    id: response.auth_org_id || response.id,
    name: response.name,
    logoUrl: null,
  };
}

export function switchOrganizationBody(authOrgId: string) {
  return JSON.stringify({ auth_org_id: authOrgId });
}

const POLICIES_WORKSPACE_PROBE_PATH = "/api/v1/policies";
const ISOLATION_WAIT_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000, 8000] as const;

export function isTenantIsolationPendingError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("still being isolated") ||
    message.includes("data isolation failed") ||
    (message.includes("503") && message.includes("isolat")) ||
    /\b502\b/.test(message) ||
    /\b503\b/.test(message) ||
    /\b504\b/.test(message)
  );
}

/** Retry a cheap data-plane read until the org schema is ready (or a non-isolation error). */
export async function waitForIsolatedWorkspace(token: string, orgId: string): Promise<void> {
  let lastError: unknown;
  for (const delayMs of ISOLATION_WAIT_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      await apiFetch(POLICIES_WORKSPACE_PROBE_PATH, undefined, { token, orgId });
      return;
    } catch (caught) {
      lastError = caught;
      if (!isTenantIsolationPendingError(caught)) {
        return;
      }
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Organization workspace is still being isolated. Retry in a few seconds.");
}
