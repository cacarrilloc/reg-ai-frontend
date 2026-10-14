"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isAuthConfigured } from "@/lib/auth";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { useAuthSession } from "@/components/auth/auth-session";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Danger-zone control to permanently delete the active external organization
 * and its dedicated Supabase project.
 */
export function DeleteOrganizationCard() {
  if (!isAuthConfigured()) {
    return null;
  }
  return <AuthedDeleteOrganizationCard />;
}

function AuthedDeleteOrganizationCard() {
  const router = useRouter();
  const { orgId, getAuthToken, authState } = useBackendAuth();
  const { canDeleteResources } = useMemberCapabilities();
  const { refreshSession } = useAuthSession();
  const [organizationName, setOrganizationName] = useState("");
  const [isLoadingName, setIsLoadingName] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadName() {
      if (authState !== "ready" || !orgId) {
        setIsLoadingName(false);
        return;
      }
      setIsLoadingName(true);
      try {
        const token = await getAuthToken();
        if (!token) {
          return;
        }
        const settings = await apiFetch<{ name: string }>(
          "/api/v1/organizations/current/settings",
          undefined,
          { token, orgId }
        );
        if (!cancelled) {
          setOrganizationName((settings.name || "").trim());
        }
      } catch {
        if (!cancelled) {
          setOrganizationName("");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingName(false);
        }
      }
    }
    void loadName();
    return () => {
      cancelled = true;
    };
  }, [authState, getAuthToken, orgId]);

  const expectedName = organizationName.trim();
  const canDelete = useMemo(
    () => Boolean(expectedName) && confirmName.trim() === expectedName,
    [confirmName, expectedName]
  );

  if (authState === "loading" || isLoadingName || !canDeleteResources) {
    return null;
  }

  async function handleDelete() {
    if (!canDelete || !orgId) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("You must be signed in to delete this organization.");
      }
      await apiFetch("/api/v1/organizations/current", { method: "DELETE" }, { token, orgId });
      try {
        await refreshSession();
      } catch {
        // Session may be stale after teardown; continue to organizations picker.
      }
      setIsOpen(false);
      setConfirmName("");
      router.replace("/organizations" as Route);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete organization.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Delete organization</CardTitle>
          <CardDescription>
            Permanently remove this organization, all of its compliance data, and its dedicated
            Supabase project. Internal Development/Staging/Production accounts cannot be deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => {
              setError(null);
              setConfirmName("");
              setIsOpen(true);
            }}
            disabled={!orgId || !expectedName}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete organization
          </Button>
        </CardContent>
      </Card>

      {isOpen ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="org-delete-confirm-title"
          aria-describedby="org-delete-confirm-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border-2 border-destructive bg-background p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-4">
                <div className="space-y-2">
                  <h2 id="org-delete-confirm-title" className="text-lg font-semibold">
                    Delete {expectedName}?
                  </h2>
                  <div
                    id="org-delete-confirm-description"
                    className="space-y-2 text-sm text-muted-foreground"
                  >
                    <p>This action is permanent and cannot be undone.</p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>All organization members lose access immediately</li>
                      <li>
                        Policies, reviews, gap analyses, documents, billing links, and audit history
                        for this organization are deleted
                      </li>
                      <li>
                        The dedicated Supabase project for this organization is destroyed (platform
                        Development/Staging/Production projects are never deleted)
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-org-name">
                    Type <span className="font-semibold text-foreground">{expectedName}</span> to
                    confirm
                  </Label>
                  <Input
                    id="confirm-org-name"
                    value={confirmName}
                    onChange={(event) => setConfirmName(event.target.value)}
                    autoComplete="off"
                    disabled={isDeleting}
                  />
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={!canDelete || isDeleting}
                    onClick={() => void handleDelete()}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Yes, delete organization"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isDeleting}
                    onClick={() => {
                      setIsOpen(false);
                      setConfirmName("");
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
