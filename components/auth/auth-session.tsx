"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useCallback } from "react";
import { useSupabaseContext } from "@/components/providers/supabase-provider";

export type AuthSession = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  activeOrgId: string | null;
  refreshSession: () => Promise<Session | null>;
  signOut: () => Promise<void>;
};

function readActiveOrgId(user: User | null): string | null {
  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const candidate = appMetadata.active_org_id ?? appMetadata.org_id ?? appMetadata.orgId;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

/**
 * Client-side Supabase auth session hook. Mirrors the Clerk `useAuth`/`useUser`
 * shape used across the app so components migrate with minimal changes.
 */
export function useAuthSession(): AuthSession {
  const { client, session, isLoaded } = useSupabaseContext();

  const refreshSession = useCallback(async () => {
    if (!client) {
      return null;
    }
    const { data, error } = await client.auth.refreshSession();
    if (error) {
      throw error;
    }
    return data.session;
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) {
      return;
    }
    await client.auth.signOut();
  }, [client]);

  return {
    isLoaded,
    isSignedIn: Boolean(session?.user),
    user: session?.user ?? null,
    session,
    accessToken: session?.access_token ?? null,
    activeOrgId: readActiveOrgId(session?.user ?? null),
    refreshSession,
    signOut
  };
}
