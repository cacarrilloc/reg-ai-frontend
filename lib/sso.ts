import { apiFetch } from "@/lib/api";

export type SsoLoginPolicy = {
  domain: string | null;
  sso_required: boolean;
  sso_available: boolean;
  auth_org_id: string | null;
};

export type SsoConnection = {
  id: string;
  auth_org_id: string;
  domains: string[];
  supabase_provider_id: string | null;
  metadata_url: string | null;
  sso_only: boolean;
  jit_enabled: boolean;
  default_role: string;
  group_role_mappings: Record<string, string>;
  attribute_groups_key: string;
  status: string;
  last_error: string | null;
  sp: { entity_id: string; acs_url: string; metadata_url: string } | null;
  updated_at: string | null;
};

export type SsoSpInfo = {
  entity_id: string;
  acs_url: string;
  metadata_url: string;
  sso_enabled: boolean;
};

export function isSsoUiEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_SSO_ENABLED?.trim().toLowerCase();
  if (flag == null || flag === "") {
    return true;
  }
  return flag === "true" || flag === "1" || flag === "yes";
}

export async function fetchSsoLoginPolicy(email: string): Promise<SsoLoginPolicy> {
  return apiFetch<SsoLoginPolicy>(
    "/api/v1/auth/sso/login-policy",
    {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    },
    { timeoutMs: 8_000 }
  );
}

export async function syncSsoJit(token: string, groups?: string[]): Promise<void> {
  await apiFetch(
    "/api/v1/auth/sso/jit-sync",
    {
      method: "POST",
      body: JSON.stringify({ groups: groups ?? null }),
    },
    { token }
  );
}

export async function fetchOrgSso(
  token: string,
  orgId: string
): Promise<SsoConnection | null> {
  return apiFetch<SsoConnection | null>(
    "/api/v1/organizations/current/sso",
    { method: "GET" },
    { token, orgId }
  );
}

export async function saveOrgSso(
  token: string,
  orgId: string,
  payload: {
    domains: string[];
    metadata_url?: string | null;
    metadata_xml?: string | null;
    sso_only: boolean;
    jit_enabled: boolean;
    default_role: string;
    group_role_mappings: Record<string, string>;
  }
): Promise<SsoConnection> {
  return apiFetch<SsoConnection>(
    "/api/v1/organizations/current/sso",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    { token, orgId }
  );
}

export async function deleteOrgSso(token: string, orgId: string): Promise<void> {
  await apiFetch(
    "/api/v1/organizations/current/sso",
    { method: "DELETE" },
    { token, orgId }
  );
}

export async function fetchSsoSpInfo(token: string, orgId: string): Promise<SsoSpInfo> {
  return apiFetch<SsoSpInfo>(
    "/api/v1/organizations/current/sso/sp-info",
    { method: "GET" },
    { token, orgId }
  );
}
