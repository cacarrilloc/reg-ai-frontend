"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SupabaseContextValue = {
  client: SupabaseClient | undefined;
  session: Session | null;
  isLoaded: boolean;
};

const SupabaseContext = createContext<SupabaseContextValue>({
  client: undefined,
  session: null,
  isLoaded: true
});

/**
 * Provides the browser Supabase client and the live session to the app.
 * When Supabase is not configured (local no-auth mode), `client` is
 * undefined and `isLoaded` is immediately true with a null session.
 */
export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(!client);

  useEffect(() => {
    if (!client) {
      setIsLoaded(true);
      return;
    }

    let cancelled = false;

    client.auth.getSession().then(({ data }: Awaited<ReturnType<SupabaseClient["auth"]["getSession"]>>) => {
      if (!cancelled) {
        setSession(data.session);
        setIsLoaded(true);
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
      setSession(nextSession);
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo(() => ({ client, session, isLoaded }), [client, session, isLoaded]);

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabaseContext() {
  return useContext(SupabaseContext);
}
