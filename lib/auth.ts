import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export function isAuthConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/** @deprecated Use isAuthConfigured. Kept during the Clerk → Supabase cutover. */
export const isClerkConfigured = isAuthConfigured;

export function getLocalDevOrgId() {
  return process.env.NEXT_PUBLIC_DEV_ORG_ID?.trim() || "dev-org";
}

export function getLocalDevOrgOverride() {
  const orgId = process.env.NEXT_PUBLIC_DEV_ORG_ID?.trim();
  if (!orgId || orgId === "dev-org") {
    return undefined;
  }
  return orgId;
}

export function getEffectiveOrgId(activeOrgId?: string | null, fallbackOrgId?: string | null) {
  return getLocalDevOrgOverride() || activeOrgId || fallbackOrgId;
}
