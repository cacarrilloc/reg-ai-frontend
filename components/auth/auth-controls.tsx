"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LifeBuoy, LogOut, Settings } from "lucide-react";
import { useAuthSession } from "@/components/auth/auth-session";
import { OrganizationLogoAvatar } from "@/components/organizations/organization-logo-avatar";
import { isAuthConfigured } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import {
  ORGANIZATIONS_MINE_PATH,
  ORGANIZATIONS_SWITCH_PATH,
  mapOrganizationList,
  switchOrganizationBody,
  type OrganizationSummary,
} from "@/lib/organizations";
import { reservedInternalOrgName } from "@/lib/system-permissions";
import { Button } from "@/components/ui/button";

export function AuthControls() {
  if (!isAuthConfigured()) {
    return null;
  }

  return <SupabaseAuthControls />;
}

function SupabaseAuthControls() {
  const { isLoaded, isSignedIn, accessToken, activeOrgId, refreshSession, signOut } = useAuthSession();
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrganizationSummary | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrganizations() {
      if (!isSignedIn || !accessToken) {
        return;
      }
      const [mineResult, settingsResult] = await Promise.allSettled([
        apiFetch<{
          organizations: Array<{
            auth_org_id: string;
            name: string;
            role?: string;
            status?: string;
            logo_display_url?: string | null;
            logo_url?: string | null;
          }>;
        }>(ORGANIZATIONS_MINE_PATH, undefined, { token: accessToken }),
        apiFetch<{
          auth_org_id?: string;
          name?: string;
          logo_display_url?: string | null;
          logo_url?: string | null;
        }>("/api/v1/organizations/current/settings", undefined, {
          token: accessToken,
          orgId: activeOrgId,
        }),
      ]);
      if (cancelled) {
        return;
      }
      if (mineResult.status === "fulfilled") {
        setOrganizations(mapOrganizationList(mineResult.value).organizations);
      } else {
        setOrganizations([]);
      }
      if (settingsResult.status === "fulfilled") {
        const settings = settingsResult.value;
        const id = settings.auth_org_id || activeOrgId || "";
        setCurrentOrg(
          id
            ? {
                id,
                name: settings.name || reservedInternalOrgName(id) || "Organization",
                logoUrl: settings.logo_display_url || settings.logo_url || null,
              }
            : null
        );
      } else {
        setCurrentOrg(
          activeOrgId
            ? {
                id: activeOrgId,
                name: reservedInternalOrgName(activeOrgId) || "Organization",
                logoUrl: null,
              }
            : null
        );
      }
    }

    void loadOrganizations();

    function onLogoUpdated() {
      void loadOrganizations();
    }
    window.addEventListener("reg-ai:org-logo-updated", onLogoUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("reg-ai:org-logo-updated", onLogoUpdated);
    };
  }, [accessToken, activeOrgId, isSignedIn]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  const activeOrg = useMemo(() => {
    const fromList = organizations.find((org) => org.id === activeOrgId);
    if (fromList) {
      if (!fromList.logoUrl && currentOrg?.logoUrl && currentOrg.id === fromList.id) {
        return { ...fromList, logoUrl: currentOrg.logoUrl };
      }
      return fromList;
    }
    if (currentOrg && (!activeOrgId || currentOrg.id === activeOrgId)) {
      return currentOrg;
    }
    if (activeOrgId) {
      return {
        id: activeOrgId,
        name: reservedInternalOrgName(activeOrgId) || "Organization",
        logoUrl: currentOrg?.id === activeOrgId ? currentOrg.logoUrl : null,
      };
    }
    return currentOrg;
  }, [activeOrgId, currentOrg, organizations]);

  const switchOrganization = useCallback(
    async (orgId: string) => {
      if (!accessToken || orgId === activeOrgId) {
        setMenuOpen(false);
        return;
      }
      setIsSwitching(true);
      try {
        await apiFetch(
          ORGANIZATIONS_SWITCH_PATH,
          { method: "POST", body: switchOrganizationBody(orgId) },
          { token: accessToken }
        );
        await refreshSession();
        setMenuOpen(false);
        router.refresh();
      } catch {
        // Keep previous selection on failure.
      } finally {
        setIsSwitching(false);
      }
    },
    [accessToken, activeOrgId, refreshSession, router]
  );

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <Button asChild size="sm">
          <Link href={"/sign-in" as Route}>
            Sign in
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href={"/sign-up" as Route}>
            Sign up
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {activeOrg ? (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Switch organization"
            aria-expanded={menuOpen}
            disabled={isSwitching}
            className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <OrganizationLogoAvatar
              name={activeOrg.name || "Organization"}
              logoUrl={activeOrg.logoUrl}
              size="sm"
            />
            <span className="max-w-[10rem] truncate">
              {activeOrg.name || "Select organization…"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-50 mt-1 min-w-[14rem] overflow-hidden rounded-md border bg-card py-1 text-card-foreground shadow-md">
              {(organizations.length ? organizations : [activeOrg]).map((org) => (
                <button
                  key={org.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                  onClick={() => void switchOrganization(org.id)}
                >
                  <OrganizationLogoAvatar name={org.name} logoUrl={org.logoUrl} size="sm" />
                  <span className="truncate">{org.name}</span>
                </button>
              ))}
              <div className="my-1 border-t" />
              <Link
                href={"/settings" as Route}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                onClick={() => setMenuOpen(false)}
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                Organization Settings
              </Link>
              <Link
                href={"/support" as Route}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                onClick={() => setMenuOpen(false)}
              >
                <LifeBuoy className="h-3.5 w-3.5 text-muted-foreground" />
                Support
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      <Button size="sm" className="gap-1.5" onClick={() => void handleSignOut()}>
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </Button>
    </div>
  );
}
