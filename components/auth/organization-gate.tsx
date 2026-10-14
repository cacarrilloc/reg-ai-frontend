"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthSession } from "@/components/auth/auth-session";
import { isAuthConfigured } from "@/lib/auth";

/**
 * Requires a signed-in user with an active organization.
 * Otherwise redirects to /organizations for select/create.
 */
export function OrganizationGate({ children }: { children: React.ReactNode }) {
  if (!isAuthConfigured()) {
    return children;
  }

  return <SupabaseOrganizationGate>{children}</SupabaseOrganizationGate>;
}

function SupabaseOrganizationGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, activeOrgId } = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !activeOrgId) {
      router.replace("/organizations" as Route);
    }
  }, [activeOrgId, isLoaded, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading organization…
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Redirecting to organizations…
      </div>
    );
  }

  return children;
}
