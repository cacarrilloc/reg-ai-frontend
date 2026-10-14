"use client";

import { useEffect } from "react";
import { useAuthSession } from "@/components/auth/auth-session";
import { identifyAnalyticsUser, isPostHogConfigured, resetAnalyticsUser } from "@/lib/analytics";

export function PostHogIdentify() {
  const { isLoaded, isSignedIn, user, activeOrgId } = useAuthSession();

  useEffect(() => {
    if (!isPostHogConfigured() || !isLoaded) {
      return;
    }

    if (isSignedIn && user) {
      identifyAnalyticsUser({
        userId: user.id,
        email: user.email,
        orgId: activeOrgId
      });
      return;
    }

    resetAnalyticsUser();
  }, [activeOrgId, isLoaded, isSignedIn, user]);

  return null;
}
