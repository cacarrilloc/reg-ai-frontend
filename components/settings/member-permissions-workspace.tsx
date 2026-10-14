"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Info, Loader2, Shield } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { fetchCurrentMembership } from "@/lib/member-capabilities";
import {
  PERMISSION_GROUP_LABELS,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  canEditMemberPermissions,
  isReservedInternalOrgId,
  type ProductRole,
  type SystemPermissionKey,
} from "@/lib/system-permissions";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { PageChromeCard } from "@/components/dashboard/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn, successTextClassName } from "@/lib/utils";

type RoleMatrixEntry = {
  role: string;
  permissions: string[];
  is_default: boolean;
};

type RoleMatrixResponse = {
  auth_org_id: string;
  roles: RoleMatrixEntry[];
  catalog_keys: string[];
};

const GROUP_ORDER = ["organization", "billing", "domains", "connections", "members"] as const;

type MemberPermissionsWorkspaceProps = {
  /** When true, nest inside an existing card instead of acting as a page hero. */
  embedded?: boolean;
  readOnly?: boolean;
};

export function MemberPermissionsWorkspace({
  embedded = false,
  readOnly = false,
}: MemberPermissionsWorkspaceProps) {
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  const [selectedRole, setSelectedRole] = useState<ProductRole>("product_manager");
  const [matrix, setMatrix] = useState<RoleMatrixResponse | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<SystemPermissionKey>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canEdit, setCanEdit] = useState(!readOnly);

  const selectedMeta = SYSTEM_ROLES.find((role) => role.value === selectedRole) ?? SYSTEM_ROLES[0];
  const editable = canEdit && !readOnly;

  const loadMatrix = useCallback(async () => {
    if (authState !== "ready" || !orgId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const [response, me] = await Promise.all([
        apiFetch<RoleMatrixResponse>("/api/v1/organizations/current/role-permissions", undefined, {
          token,
          orgId,
          orgName,
        }),
        fetchCurrentMembership({ token, orgId, orgName }).catch(() => null),
      ]);
      setMatrix(response);
      if (me) {
        setCanEdit(
          Boolean(me.can_edit_member_permissions) ||
            canEditMemberPermissions({ orgId, role: me.role })
        );
      } else {
        setCanEdit(canEditMemberPermissions({ orgId, role: null }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Member Permissions.");
      setMatrix(null);
    } finally {
      setIsLoading(false);
    }
  }, [authState, getAuthToken, orgId, orgName]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    const entry = matrix?.roles.find((item) => item.role === selectedRole);
    setDraftPermissions(new Set((entry?.permissions ?? []) as SystemPermissionKey[]));
    setMessage(null);
  }, [matrix, selectedRole]);

  const groupedPermissions = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      label: PERMISSION_GROUP_LABELS[group] ?? group,
      items: SYSTEM_PERMISSIONS.filter((item) => item.group === group),
    })).filter((section) => section.items.length > 0);
  }, []);

  function togglePermission(key: SystemPermissionKey) {
    if (!editable) {
      return;
    }
    setDraftPermissions((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setMessage(null);
  }

  async function savePermissions() {
    if (authState !== "ready" || !editable) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAuthToken();
      const response = await apiFetch<RoleMatrixResponse>(
        "/api/v1/organizations/current/role-permissions",
        {
          method: "PUT",
          body: JSON.stringify({
            role: selectedRole,
            permissions: Array.from(draftPermissions),
          }),
        },
        { token, orgId, orgName }
      );
      setMatrix(response);
      setMessage(`Saved permissions for ${selectedMeta.label}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save permissions.");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyRoleKey() {
    try {
      await navigator.clipboard.writeText(selectedMeta.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (isLoading) {
    return (
      <PageChromeCard
        title={
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Member Permissions…
          </span>
        }
        titleClassName="text-base"
      />
    );
  }

  return (
    <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="space-y-6">
        {!embedded ? (
          <PageChromeCard
            title={
              <span className="flex items-center gap-2">
                <Shield className="h-6 w-6" />
                {selectedMeta.label}
              </span>
            }
            description={selectedMeta.description}
            titleClassName="text-2xl"
          />
        ) : (
          <PageChromeCard
            title={selectedMeta.label}
            description={selectedMeta.description}
            titleClassName="text-lg"
          />
        )}

        {isReservedInternalOrgId(orgId) ? (
          <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            On Development, Staging, and Production, roles keep full System access until you save a
            customized matrix for that role. Saved defaults and per-member overrides then apply at
            runtime.
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" value={selectedMeta.label} readOnly />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role-key">Key</Label>
              <Input id="role-key" value={selectedMeta.value} readOnly />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role-description">Description</Label>
              <Textarea id="role-description" value={selectedMeta.description} readOnly rows={3} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Permissions</CardTitle>
                <CardDescription>
                  System permissions for this role in the current organization.
                </CardDescription>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="rounded-md bg-muted px-2.5 py-1 font-medium">System permissions</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {groupedPermissions.map((section) => (
              <div key={section.group} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </p>
                <ul className="divide-y rounded-md border">
                  {section.items.map((permission) => {
                    const checked = draftPermissions.has(permission.key);
                    return (
                      <li
                        key={permission.key}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm"
                      >
                        <input
                          id={`perm-${permission.key}`}
                          type="checkbox"
                          checked={checked}
                          disabled={!editable}
                          onChange={() => togglePermission(permission.key)}
                          className="h-4 w-4 accent-violet-600 disabled:opacity-60"
                        />
                        <label
                          htmlFor={`perm-${permission.key}`}
                          className="flex min-w-0 flex-1 items-center gap-2"
                        >
                          <span className="font-medium">{permission.name}</span>
                          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        </label>
                        <code className="shrink-0 text-xs text-muted-foreground">{permission.key}</code>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {editable ? (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="button" onClick={() => void savePermissions()} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save permissions
                </Button>
                {message ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Roles</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {SYSTEM_ROLES.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => setSelectedRole(role.value)}
                className={`rounded-md px-2.5 py-2 text-left text-sm transition ${
                  selectedRole === role.value ? "bg-violet-600 text-white" : "hover:bg-muted"
                }`}
              >
                {role.label}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="truncate text-xs">{selectedMeta.key}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 px-0"
                  onClick={() => void copyRoleKey()}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only">Copy role key</span>
                </Button>
              </div>
              {copied ? (
                <p className={cn("mt-1 text-xs", successTextClassName)}>Copied</p>
              ) : null}
            </div>
            <div>
              <p className="mt-1 text-muted-foreground">
                {draftPermissions.size} of {SYSTEM_PERMISSIONS.length} Permissions Granted
              </p>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
