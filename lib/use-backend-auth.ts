"use client";

import { useCallback } from "react";
import { useAuthSession } from "@/components/auth/auth-session";
import { getEffectiveOrgId } from "@/lib/auth";

export type BackendAuthState = "loading" | "signed-out" | "ready";

/**
 * Stable Supabase → backend auth helpers.
 * Inline `() => session.access_token` recreates every render and retriggers
 * data-loading effects, which makes table pages blink.
 */
export function useBackendAuth() {
  const { isLoaded, isSignedIn, accessToken, activeOrgId, refreshSession } = useAuthSession();

  const getAuthToken = useCallback(
    async (options?: { skipCache?: boolean }) => {
      if (options?.skipCache) {
        const refreshed = await refreshSession();
        return refreshed?.access_token ?? null;
      }
      return accessToken;
    },
    [accessToken, refreshSession]
  );

  const authState: BackendAuthState = !isLoaded
    ? "loading"
    : isSignedIn
      ? "ready"
      : "signed-out";

  return {
    authState,
    getAuthToken,
    orgId: getEffectiveOrgId(activeOrgId, null),
    orgName: null as string | null,
  };
}
