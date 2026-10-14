"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Trash2, UserMinus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useAuthSession } from "@/components/auth/auth-session";
import { apiFetch } from "@/lib/api";
import {
  formatRoleLabel,
  inviteRolesForOrg,
  isReservedInternalOrgId,
} from "@/lib/system-permissions";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrganizationMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type OrganizationMemberListResponse = {
  members: OrganizationMember[];
  total: number;
  current_user_id?: string | null;
  can_manage_members?: boolean;
};

type PendingInvite = {
  id: string;
  email: string;
  invitee_name: string | null;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
};

type InviteListResponse = {
  invites: PendingInvite[];
  can_cancel_invites?: boolean;
};

type InviteResponse = {
  email: string;
  role: string;
  status: string;
};

function formatInviteExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "unknown expiry";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Invites teammates by email, lists pending invitations, and lists current members.
 * Shows Remove Member (managers) or Leave organization (self).
 * Master Users can delete pending invitations.
 */
export function OrganizationMembersInviteCard() {
  const router = useRouter();
  const { user, refreshSession } = useAuthSession();
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  const { canDeleteResources } = useMemberCapabilities();
  const roleOptions = useMemo(() => inviteRolesForOrg(orgId), [orgId]);
  const isInternalOrg = isReservedInternalOrgId(orgId);
  const defaultRole = isInternalOrg ? "master_user" : "nominated_team_member";

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [memberPendingConfirm, setMemberPendingConfirm] = useState<OrganizationMember | null>(
    null
  );

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [canCancelInvites, setCanCancelInvites] = useState(false);
  const [canViewInvites, setCanViewInvites] = useState(false);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [role, setRole] = useState<string>(defaultRole);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!roleOptions.some((option) => option.value === role)) {
      setRole(defaultRole);
    }
  }, [defaultRole, role, roleOptions]);

  const loadMembers = useCallback(async () => {
    if (authState !== "ready" || !orgId) {
      return;
    }
    setIsLoadingMembers(true);
    setMembersError(null);
    try {
      const token = await getAuthToken();
      const response = await apiFetch<OrganizationMemberListResponse>(
        "/api/v1/organizations/current/members",
        undefined,
        { token, orgId, orgName }
      );
      setMembers(response.members ?? []);
      setCanManageMembers(Boolean(response.can_manage_members));
      setViewerUserId(response.current_user_id || user?.id || null);
    } catch (caught) {
      setMembersError(caught instanceof Error ? caught.message : "Unable to load members.");
    } finally {
      setIsLoadingMembers(false);
    }
  }, [authState, getAuthToken, orgId, orgName, user?.id]);

  const loadInvites = useCallback(async () => {
    if (authState !== "ready" || !orgId) {
      return;
    }
    setIsLoadingInvites(true);
    setInvitesError(null);
    try {
      const token = await getAuthToken();
      const response = await apiFetch<InviteListResponse>(
        "/api/v1/organizations/current/team-requests",
        undefined,
        { token, orgId, orgName }
      );
      setPendingInvites(response.invites ?? []);
      setCanCancelInvites(Boolean(response.can_cancel_invites));
      setCanViewInvites(true);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "";
      // Invite managers only — hide the pending section on 403.
      if (text.toLowerCase().includes("forbidden") || text.includes("403")) {
        setCanViewInvites(false);
        setPendingInvites([]);
        setCanCancelInvites(false);
      } else {
        setCanViewInvites(true);
        setInvitesError(text || "Unable to load pending invitations.");
      }
    } finally {
      setIsLoadingInvites(false);
    }
  }, [authState, getAuthToken, orgId, orgName]);

  useEffect(() => {
    void loadMembers();
    void loadInvites();
  }, [loadInvites, loadMembers]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authState !== "ready" || !email.trim()) {
      return;
    }
    setIsInviting(true);
    setInviteError(null);
    setInviteMessage(null);
    try {
      const token = await getAuthToken();
      const trimmedName = inviteeName.trim();
      const response = await apiFetch<InviteResponse>(
        "/api/v1/organizations/current/team-requests",
        {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            role,
            ...(trimmedName ? { invitee_name: trimmedName } : {}),
          }),
        },
        { token, orgId, orgName }
      );
      const nameBit = trimmedName ? ` (${trimmedName})` : "";
      setInviteMessage(
        `Invitation email sent to ${response.email}${nameBit} as ${formatRoleLabel(response.role)}.`
      );
      setEmail("");
      setInviteeName("");
      await Promise.all([loadMembers(), loadInvites()]);
    } catch (caught) {
      setInviteError(
        caught instanceof Error ? caught.message : "Unable to send the invitation email."
      );
    } finally {
      setIsInviting(false);
    }
  }

  async function handleDeleteInvite(invite: PendingInvite) {
    const label = invite.invitee_name
      ? `${invite.invitee_name} (${invite.email})`
      : invite.email;
    if (!window.confirm(`Delete the pending invitation for ${label}?`)) {
      return;
    }
    setPendingInviteId(invite.id);
    setInvitesError(null);
    try {
      const token = await getAuthToken();
      await apiFetch(
        `/api/v1/organizations/current/team-requests/${encodeURIComponent(invite.id)}`,
        { method: "DELETE" },
        { token, orgId, orgName }
      );
      setInviteMessage(`Deleted pending invitation for ${invite.email}.`);
      await loadInvites();
    } catch (caught) {
      setInvitesError(
        caught instanceof Error ? caught.message : "Unable to delete the invitation."
      );
    } finally {
      setPendingInviteId(null);
    }
  }

  function requestRemoveOrLeave(member: OrganizationMember) {
    setMembersError(null);
    setMemberPendingConfirm(member);
  }

  async function confirmRemoveOrLeave() {
    const member = memberPendingConfirm;
    if (!member) {
      return;
    }
    const isSelf = Boolean(viewerUserId && member.user_id === viewerUserId);

    setPendingMemberId(member.user_id);
    setMembersError(null);
    try {
      const token = await getAuthToken();
      if (isSelf) {
        await apiFetch(
          "/api/v1/organizations/current/leave",
          { method: "POST" },
          { token, orgId, orgName }
        );
        setMemberPendingConfirm(null);
        await refreshSession();
        router.replace("/organizations" as Route);
        router.refresh();
        return;
      }
      await apiFetch(
        `/api/v1/organizations/current/members/${encodeURIComponent(member.user_id)}`,
        { method: "DELETE" },
        { token, orgId, orgName }
      );
      setMemberPendingConfirm(null);
      await loadMembers();
    } catch (caught) {
      setMembersError(caught instanceof Error ? caught.message : "Unable to update membership.");
      setMemberPendingConfirm(null);
    } finally {
      setPendingMemberId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Members &amp; Invitations
        </CardTitle>
        <CardDescription>
          Invite teammates by email. They sign in and belong to this organization — they do not
          create or own a new one. Pending invitations stay until accepted, expired, or deleted.
          Internal Development, Staging, and Production members always have Master User access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] sm:items-end"
          onSubmit={handleInvite}
        >
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@firm.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-name">
              Invitee name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="invite-name"
              type="text"
              value={inviteeName}
              onChange={(event) => setInviteeName(event.target.value)}
              placeholder="Jane Doe"
              maxLength={160}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={isInviting || authState !== "ready"} className="gap-2">
            {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send invite
          </Button>
        </form>
        {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
        {inviteMessage ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{inviteMessage}</p>
        ) : null}

        {canViewInvites || isLoadingInvites ? (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Pending invitations</p>
            {isLoadingInvites ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading invitations…
              </p>
            ) : null}
            {!isLoadingInvites && invitesError ? (
              <p className="text-sm text-destructive">{invitesError}</p>
            ) : null}
            {!isLoadingInvites && !invitesError && pendingInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            ) : null}
            {!isLoadingInvites && pendingInvites.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {pendingInvites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {invite.invitee_name ? (
                        <>
                          {invite.invitee_name}
                          <span className="ml-1 text-muted-foreground">({invite.email})</span>
                        </>
                      ) : (
                        invite.email
                      )}
                      <span className="ml-2 text-xs text-muted-foreground">
                        expires {formatInviteExpiry(invite.expires_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                        Pending
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRoleLabel(invite.role)}
                      </span>
                      {canCancelInvites && canDeleteResources ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          disabled={pendingInviteId === invite.id}
                          onClick={() => void handleDeleteInvite(invite)}
                        >
                          {pendingInviteId === invite.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Current members</p>
          {isLoadingMembers ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading members…
            </p>
          ) : null}
          {!isLoadingMembers && membersError ? (
            <p className="text-sm text-destructive">{membersError}</p>
          ) : null}
          {!isLoadingMembers && !membersError && members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : null}
          {!isLoadingMembers && members.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {members.map((member) => {
                const isSelf = Boolean(viewerUserId && member.user_id === viewerUserId);
                const showAction = isSelf || (canManageMembers && canDeleteResources);
                return (
                  <li
                    key={member.user_id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {member.full_name || member.email || member.user_id}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatRoleLabel(member.role)}
                      </span>
                      {showAction ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          disabled={
                            pendingMemberId === member.user_id || Boolean(memberPendingConfirm)
                          }
                          onClick={() => requestRemoveOrLeave(member)}
                        >
                          {pendingMemberId === member.user_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserMinus className="h-3.5 w-3.5" />
                          )}
                          {isSelf ? "Leave org" : "Remove"}
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </CardContent>

      {memberPendingConfirm ? (
        <MemberRemoveConfirmDialog
          member={memberPendingConfirm}
          isSelf={Boolean(viewerUserId && memberPendingConfirm.user_id === viewerUserId)}
          isSubmitting={pendingMemberId === memberPendingConfirm.user_id}
          onCancel={() => {
            if (pendingMemberId) {
              return;
            }
            setMemberPendingConfirm(null);
          }}
          onConfirm={() => void confirmRemoveOrLeave()}
        />
      ) : null}
    </Card>
  );
}

function MemberRemoveConfirmDialog({
  member,
  isSelf,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  member: OrganizationMember;
  isSelf: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const displayName = member.full_name || member.email || member.user_id;
  const title = isSelf ? "Leave this organization?" : "Remove this member?";
  const description = isSelf
    ? "You will lose access to this organization and will need a new invite to rejoin."
    : `${displayName} will lose access immediately. They will need a new invite to rejoin.`;
  const confirmLabel = isSelf ? "Leave organization" : "Remove member";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="member-remove-confirm-title"
      aria-describedby="member-remove-confirm-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        <div className="space-y-3">
          <h2 id="member-remove-confirm-title" className="text-lg font-semibold">
            {title}
          </h2>
          <p id="member-remove-confirm-description" className="text-sm text-muted-foreground">
            {description}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onConfirm}
              disabled={isSubmitting}
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
              {isSubmitting ? "Working…" : confirmLabel}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
