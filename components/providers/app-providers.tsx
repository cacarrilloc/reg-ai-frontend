"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { Suspense, useEffect } from "react";
import { PostHogIdentify } from "@/components/providers/posthog-identify";
import { PostHogPageView } from "@/components/providers/posthog-pageview";

function ensurePostHogInitialized(apiKey: string, apiHost: string) {
  // React Strict Mode remounts effects in dev; PostHog is a singleton.
  if (posthog.__loaded) {
    return;
  }
  posthog.init(apiKey, {
    api_host: apiHost,
    capture_pageview: false,
    person_profiles: "identified_only",
  });
}

function PostHogProviders({ children }: { children: React.ReactNode }) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  useEffect(() => {
    if (!posthogKey) {
      return;
    }
    ensurePostHogInitialized(posthogKey, posthogHost);
  }, [posthogHost, posthogKey]);

  if (!posthogKey) {
    return children;
  }

  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </PostHogProvider>
  );
}

/** Root layout owns SupabaseProvider; this only wraps PostHog. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return <PostHogProviders>{children}</PostHogProviders>;
}
