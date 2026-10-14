"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Loader2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { fetchCurrentMembership } from "@/lib/member-capabilities";
import {
  PERMISSION_GROUP_LABELS,
  SYSTEM_PERMISSIONS,
  canEditMemberPermissions,
  formatRoleLabel,
  type SystemPermissionKey,
} from "@/lib/system-permissions";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MemberPermissionEntry = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  permissions: string[];
  role_default_permissions: string[];
  is_custom: boolean;
};

type MemberPermissionListResponse = {
  auth_org_id: string;
  members: MemberPermissionEntry[];
  catalog_keys: string[];
};

const GROUP_ORDER = ["organization", "billing", "domains", "connections", "members"] as const;

function memberLabel(member: MemberPermissionEntry): string {
  return member.full_name?.trim() || member.email?.trim() || member.user_id;
}

export function OrganizationMemberPermissionsSection() {
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  const { canDeleteResources } = useMemberCapabilities();
  const [members, setMembers] = useState<MemberPermissionEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<SystemPermissionKey>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [visible, setVisible] = useState(false);

  const selected = members.find((member) => member.user_id === selectedUserId) ?? null;

  const load = useCallback(async () => {
    if (authState !== "ready" || !orgId) {
      setVisible(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const [response, me] = await Promise.all([
        apiFetch<MemberPermissionListResponse>(
          "/api/v1/organizations/current/member-permissions",
          undefined,
          { token, orgId, orgName }
        ),
        fetchCurrentMembership({ token, orgId, orgName }).catch(() => null),
      ]);
      setMembers(response.members);
      setSelectedUserId((current) => {
        if (current && response.members.some((member) => member.user_id === current)) {
          return current;
        }
        return response.members[0]?.user_id ?? null;
      });
      const editable =
        Boolean(me?.can_edit_member_permissions) ||
        canEditMemberPermissions({ orgId, role: me?.role ?? null });
      setCanEdit(editable);
      setVisible(true);
    } catch (caught) {
      // 403 means this viewer cannot manage permissions — hide section.
      const text = caught instanceof Error ? caught.message : "";
      if (text.includes("403") || text.toLowerCase().includes("forbidden")) {
        setVisible(false);
      } else {
        setVisible(true);
        setError(text || "Unable to load member permissions.");
      }
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [authState, getAuthToken, orgId, orgName]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setDraftPermissions(new Set());
      return;
    }
    setDraftPermissions(new Set(selected.permissions as SystemPermissionKey[]));
    setMessage(null);
  }, [selected]);

  const groupedPermissions = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      label: PERMISSION_GROUP_LABELS[group] ?? group,
      items: SYSTEM_PERMISSIONS.filter((item) => item.group === group),
    })).filter((section) => section.items.length > 0);
  }, []);

  function togglePermission(key: SystemPermissionKey) {
    if (!canEdit) {
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
    if (!selected || !canEdit || authState !== "ready") {
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAuthToken();
      const response = await apiFetch<{
        user_id: string;
        permissions: string[];
        role_default_permissions: string[];
        is_custom: boolean;
        role: string;
      }>(
        `/api/v1/organizations/current/member-permissions/${encodeURIComponent(selected.user_id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ permissions: Array.from(draftPermissions) }),
        },
        { token, orgId, orgName }
      );
      setMembers((current) =>
        current.map((member) =>
          member.user_id === response.user_id
            ? {
                ...member,
                permissions: response.permissions,
                role_default_permissions: response.role_default_permissions,
                is_custom: response.is_custom,
                role: response.role,
              }
            : member
        )
      );
      setMessage(`Saved permissions for ${memberLabel(selected)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save member permissions.");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetPermissions() {
    if (!selected || !canEdit || authState !== "ready") {
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAuthToken();
      const response = await apiFetch<{
        user_id: string;
        permissions: string[];
        role_default_permissions: string[];
        is_custom: boolean;
        role: string;
      }>(
        `/api/v1/organizations/current/member-permissions/${encodeURIComponent(selected.user_id)}`,
        { method: "DELETE" },
        { token, orgId, orgName }
      );
      setMembers((current) =>
        current.map((member) =>
          member.user_id === response.user_id
            ? {
                ...member,
                permissions: response.permissions,
                role_default_permissions: response.role_default_permissions,
                is_custom: response.is_custom,
                role: response.role,
              }
            : member
        )
      );
      setMessage(`Reset ${memberLabel(selected)} to role defaults.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset member permissions.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!visible) {
    return null;
  }

  if (isLoading) {
    return (
      <Card id="organization-member-permissions">
        <CardContent className="flex min-h-[16vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading member permissions…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="organization-member-permissions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          ADMIN ONLY: Edit Member Permissions ⚠️
        </CardTitle>
        <CardDescription>
          Override System permissions for each organization member. Saved values replace that
          member&apos;s role defaults. External organizations: Master Users only. Development,
          Staging, and Production: editable by all members.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members found in this organization.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-4">
              {selected ? (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">{memberLabel(selected)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.email ?? selected.user_id} · {formatRoleLabel(selected.role)}
                      {selected.is_custom ? " · Customized" : " · Using role defaults"}
                    </p>
                  </div>

                  <div className="space-y-5">
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
                                  id={`member-perm-${permission.key}`}
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!canEdit}
                                  onChange={() => togglePermission(permission.key)}
                                  className="h-4 w-4 accent-violet-600 disabled:opacity-60"
                                />
                                <label
                                  htmlFor={`member-perm-${permission.key}`}
                                  className="flex min-w-0 flex-1 items-center gap-2"
                                >
                                  <span className="font-medium">{permission.name}</span>
                                  <Info
                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                </label>
                                <code className="shrink-0 text-xs text-muted-foreground">
                                  {permission.key}
                                </code>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}

                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <Button
                          type="button"
                          onClick={() => void savePermissions()}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Save permissions
                        </Button>
                        {selected.is_custom && canDeleteResources ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void resetPermissions()}
                            disabled={isSaving}
                          >
                            Reset to role defaults
                          </Button>
                        ) : null}
                        {message ? (
                          <p className="text-sm text-emerald-700 dark:text-emerald-400">
                            {message}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <aside>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Members</p>
              <div className="grid gap-1.5">
                {members.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(member.user_id)}
                    className={`rounded-md px-2.5 py-2 text-left text-sm transition ${
                      selectedUserId === member.user_id
                        ? "bg-violet-600 text-white"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="block truncate font-medium">{memberLabel(member)}</span>
                    <span
                      className={`block truncate text-xs ${
                        selectedUserId === member.user_id
                          ? "text-white/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatRoleLabel(member.role)}
                      {member.is_custom ? " · custom" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
