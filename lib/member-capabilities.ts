/**
 * Role-based app functionalities with explicit member-type exclusions.
 *
 * Mirror of backend `app/core/member_capabilities.py`. Prefer these helpers
 * over ad-hoc `role === "master_user"` checks so future hierarchical roles
 * can be denied from a feature with one denylist entry.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cacheKey, cachedApiFetch } from "@/lib/api-cache";
import { useBackendAuth } from "@/lib/use-backend-auth";

export const DELETE_RESOURCES = "delete_resources";
export const MANAGE_NEWSLETTER_SUBSCRIBERS = "manage_newsletter_subscribers";

export const KNOWN_FUNCTIONALITIES = [
  DELETE_RESOURCES,
  MANAGE_NEWSLETTER_SUBSCRIBERS,
] as const;

export type MemberFunctionality = (typeof KNOWN_FUNCTIONALITIES)[number] | (string & {});

const OPERATOR_ROLES = new Set(["master_user", "chief_compliance_officer", "cco"]);
const NON_OPERATOR_ROLES = new Set(["product_manager", "nominated_team_member"]);

const ALLOWED_ROLES: Record<string, Set<string>> = {
  [DELETE_RESOURCES]: new Set(OPERATOR_ROLES),
  [MANAGE_NEWSLETTER_SUBSCRIBERS]: new Set(OPERATOR_ROLES),
};

const EXCLUDED_ROLES: Record<string, Set<string>> = {
  [DELETE_RESOURCES]: new Set(NON_OPERATOR_ROLES),
  [MANAGE_NEWSLETTER_SUBSCRIBERS]: new Set(NON_OPERATOR_ROLES),
};

function normalizeMembershipRole(role: string | null | undefined): string {
  return (role || "").trim().toLowerCase().replace(/^org:/, "").replace(/-/g, "_");
}

export function memberCan(
  role: string | null | undefined,
  functionality: string,
  capabilities?: readonly string[] | null
): boolean {
  if (capabilities) {
    return capabilities.includes(functionality);
  }
  const normalized = normalizeMembershipRole(role);
  if (EXCLUDED_ROLES[functionality]?.has(normalized)) {
    return false;
  }
  return Boolean(ALLOWED_ROLES[functionality]?.has(normalized));
}

export function capabilitiesForRole(role: string | null | undefined): string[] {
  return KNOWN_FUNCTIONALITIES.filter((key) => memberCan(role, key));
}

export type CurrentMembership = {
  role?: string;
  capabilities?: string[];
  can_delete_resources?: boolean;
  can_manage_newsletter_subscribers?: boolean;
  can_manage_member_permissions?: boolean;
  can_edit_member_permissions?: boolean;
};

export async function fetchCurrentMembership(options: {
  token?: string | null;
  orgId?: string | null;
  orgName?: string | null;
}): Promise<CurrentMembership> {
  return cachedApiFetch(
    cacheKey("/api/v1/organizations/current/me", options.orgId),
    () =>
      apiFetch<CurrentMembership>("/api/v1/organizations/current/me", undefined, {
        token: options.token,
        orgId: options.orgId,
        orgName: options.orgName,
      }),
    { ttlMs: 15_000 }
  );
}

export function useMemberCapabilities() {
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  const [role, setRole] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<string[] | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authState !== "ready" || !orgId) {
        if (!cancelled) {
          setRole(null);
          setCapabilities(null);
          setIsLoaded(authState !== "loading");
        }
        return;
      }
      try {
        const token = await getAuthToken();
        const me = await fetchCurrentMembership({ token, orgId, orgName });
        if (cancelled) {
          return;
        }
        setRole(me.role ?? null);
        if (Array.isArray(me.capabilities)) {
          setCapabilities(me.capabilities);
        } else {
          const inferred: string[] = [];
          if (me.can_delete_resources || memberCan(me.role, DELETE_RESOURCES)) {
            inferred.push(DELETE_RESOURCES);
          }
          if (me.can_manage_newsletter_subscribers || memberCan(me.role, MANAGE_NEWSLETTER_SUBSCRIBERS)) {
            inferred.push(MANAGE_NEWSLETTER_SUBSCRIBERS);
          }
          setCapabilities(inferred);
        }
      } catch {
        if (!cancelled) {
          setRole(null);
          setCapabilities([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authState, getAuthToken, orgId, orgName]);

  return {
    isLoaded,
    role,
    capabilities,
    canDeleteResources: memberCan(role, DELETE_RESOURCES, capabilities),
    canManageNewsletterSubscribers: memberCan(role, MANAGE_NEWSLETTER_SUBSCRIBERS, capabilities),
  };
}
