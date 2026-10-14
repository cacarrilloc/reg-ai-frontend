"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import { useAuthSession } from "@/components/auth/auth-session";
import { OrganizationAISetup } from "@/components/auth/organization-ai-setup";
import { OrganizationLogoAvatar } from "@/components/organizations/organization-logo-avatar";
import { apiFetch } from "@/lib/api";
import {
  friendlyApiError,
  keyVerificationError,
  organizationAISetupBody,
  organizationAISetupCompleteBody,
  organizationProviderName,
  type OrganizationAIChoice,
} from "@/lib/ai-models";
import {
  ORGANIZATIONS_CURRENT_AI_SETUP_PATH,
  ORGANIZATIONS_MINE_PATH,
  ORGANIZATIONS_PATH,
  ORGANIZATIONS_SWITCH_PATH,
  mapCreatedOrganization,
  mapOrganizationList,
  switchOrganizationBody,
  isTenantIsolationPendingError,
  waitForIsolatedWorkspace,
  type OrganizationSummary
} from "@/lib/organizations";
import {
  joinPathForToken,
  peekPendingInviteToken,
} from "@/lib/pending-invite";
import { claimUserProfile, normalizeUsername } from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrganizationWorkspacePickerProps = {
  /** Where to send the user after they select or create an organization. */
  nextPath?: string;
};

/**
 * Organization entry:
 * - invited teammates join via `/join` (membership row only) — never required to create an org
 * - existing memberships can be opened here
 * - creating an org is optional (for people starting their own firm), and needs an AI model choice
 */
export function OrganizationWorkspacePicker({
  nextPath = "/dashboard"
}: OrganizationWorkspacePickerProps) {
  const router = useRouter();
  const { isLoaded, accessToken, user, refreshSession } = useAuthSession();
  const [organizations, setOrganizations] = useState<OrganizationSummary[] | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [aiChoice, setAiChoice] = useState<OrganizationAIChoice | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const autoEnteredRef = useRef(false);

  const ensureProfileClaimed = useCallback(async () => {
    if (!accessToken || !user) {
      return;
    }
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const usernameRaw = metadata.username;
    const username = typeof usernameRaw === "string" ? normalizeUsername(usernameRaw) : "";
    const email = (user.email || "").trim().toLowerCase();
    if (!username || !email) {
      return;
    }
    try {
      await claimUserProfile({ username, email }, accessToken);
    } catch {
      // Profile may already exist; org selection can continue.
    }
  }, [accessToken, user]);

  const continueToOrganization = useCallback(
    async (orgId: string) => {
      if (!accessToken) {
        return;
      }
      setIsSwitching(orgId);
      setError(null);
      try {
        await apiFetch(
          ORGANIZATIONS_SWITCH_PATH,
          { method: "POST", body: switchOrganizationBody(orgId) },
          { token: accessToken }
        );
        await refreshSession();
        router.replace(nextPath as Route);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to open this organization.");
        autoEnteredRef.current = false;
      } finally {
        setIsSwitching(null);
      }
    },
    [accessToken, nextPath, refreshSession, router]
  );

  const loadOrganizations = useCallback(async () => {
    if (!accessToken) {
      setIsLoadingOrgs(false);
      return;
    }
    setIsLoadingOrgs(true);
    setError(null);
    try {
      await ensureProfileClaimed();
      const response = await apiFetch<{
        organizations: Array<{
          auth_org_id: string;
          name: string;
          role?: string;
          status?: string;
          logo_display_url?: string | null;
        }>;
      }>(ORGANIZATIONS_MINE_PATH, undefined, { token: accessToken });
      setOrganizations(mapOrganizationList(response).organizations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your organizations.");
      setOrganizations([]);
    } finally {
      setIsLoadingOrgs(false);
    }
  }, [accessToken, ensureProfileClaimed]);

  // Incomplete invite accept: finish membership before showing create/select.
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    const pendingInvite = peekPendingInviteToken();
    setPendingInviteToken(pendingInvite);
    if (pendingInvite) {
      router.replace(joinPathForToken(pendingInvite) as Route);
    }
  }, [isLoaded, router]);

  useEffect(() => {
    if (isLoaded) {
      void loadOrganizations();
    }
  }, [isLoaded, loadOrganizations]);

  // Invitees (and anyone with a single membership) should land in the app, not a create wall.
  useEffect(() => {
    if (isLoadingOrgs || autoEnteredRef.current || !organizations) {
      return;
    }
    if (organizations.length === 1) {
      autoEnteredRef.current = true;
      void continueToOrganization(organizations[0].id);
    }
  }, [continueToOrganization, isLoadingOrgs, organizations]);

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !newOrgName.trim()) {
      return;
    }
    if (!aiChoice) {
      setError("Choose Reg-AI default models or enter a provider key before creating the organization.");
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const createdRaw = await apiFetch<{
        id: string;
        auth_org_id: string;
        name: string;
        ai_setup_applied?: boolean;
      }>(
        ORGANIZATIONS_PATH,
        {
          method: "POST",
          body: JSON.stringify({
            name: newOrgName.trim(),
            ai_setup: organizationAISetupBody(aiChoice),
          }),
        },
        { token: accessToken }
      );
      const created = mapCreatedOrganization(createdRaw);
      await apiFetch(
        ORGANIZATIONS_SWITCH_PATH,
        { method: "POST", body: switchOrganizationBody(created.id) },
        { token: accessToken }
      );
      const refreshed = await refreshSession();
      const token = refreshed?.access_token ?? accessToken;
      await waitForIsolatedWorkspace(token, created.id);
      let aiSetupApplied = createdRaw.ai_setup_applied === true;
      for (const delayMs of [0, 800, 1600] as const) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        try {
          const completed = await apiFetch<{ ai_setup_applied?: boolean }>(
            ORGANIZATIONS_CURRENT_AI_SETUP_PATH,
            {
              method: "POST",
              body: JSON.stringify({ ai_setup: organizationAISetupCompleteBody(aiChoice) }),
            },
            { token, orgId: created.id, timeoutMs: 25_000 }
          );
          aiSetupApplied = completed.ai_setup_applied !== false;
          if (aiSetupApplied) {
            break;
          }
        } catch (caught) {
          if (!isTenantIsolationPendingError(caught)) {
            break;
          }
        }
      }
      setNewOrgName("");
      setAiChoice(null);
      router.replace(nextPath as Route);
      router.refresh();
    } catch (caught) {
      const message = friendlyApiError(caught, "Unable to create organization.");
      setError(
        /key was not saved|rejected this API key|invalid or wrong|could not be verified|not authorized/i.test(message)
          ? `Key verification failed. ${keyVerificationError(caught, organizationProviderName(aiChoice))}`
          : message
      );
    } finally {
      setIsCreating(false);
    }
  }

  if (!isLoaded || isLoadingOrgs || (organizations?.length === 1 && isSwitching)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {organizations?.length === 1 ? "Opening your organization…" : "Loading organizations…"}
      </div>
    );
  }

  const hasOrganizations = Boolean(organizations && organizations.length > 0);

  return (
    <div className="mx-auto flex w-full flex-col gap-4 px-2 pb-4 pt-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {hasOrganizations ? "Open an organization" : "You do not belong to an organization yet"}
          </CardTitle>
          <CardDescription>
            {hasOrganizations
              ? "Choose a workspace you already belong to."
              : "If a teammate invited you, sign in with the invited email and accept the invitation. You join that organization — you do not need to create or own one. Creating an organization is only for someone starting their own firm."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              {error}
            </p>
          ) : null}

          {hasOrganizations ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Your organizations</p>
              <div className="grid gap-2">
                {organizations?.map((org) => (
                  <Button
                    key={org.id}
                    variant="outline"
                    className="justify-between"
                    disabled={isSwitching === org.id}
                    onClick={() => void continueToOrganization(org.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <OrganizationLogoAvatar name={org.name} logoUrl={org.logoUrl} size="sm" />
                      <span className="truncate">{org.name}</span>
                    </span>
                    {isSwitching === org.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {pendingInviteToken ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finishing your invitation so you can belong to that organization…
            </p>
          ) : showCreateForm ? (
            <form className="space-y-3 border-t pt-6" onSubmit={(event) => void createOrganization(event)}>
              <div className="space-y-2">
                <Label htmlFor="org-name">New organization name</Label>
                <Input
                  id="org-name"
                  value={newOrgName}
                  onChange={(event) => setNewOrgName(event.target.value)}
                  placeholder="Acme Compliance"
                  required
                  minLength={2}
                />
              </div>
              {accessToken ? (
                <OrganizationAISetup accessToken={accessToken} value={aiChoice} onChange={setAiChoice} />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isCreating || !newOrgName.trim() || !aiChoice}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {aiChoice?.option === "own_key" ? "Testing key & creating…" : "Creating…"}
                    </>
                  ) : (
                    "Create organization"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isCreating}
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewOrgName("");
                    setAiChoice(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="border-t pt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(true)}>
                {hasOrganizations ? "Create another organization" : "Start your own organization"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
