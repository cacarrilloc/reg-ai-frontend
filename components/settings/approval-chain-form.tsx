"use client";

import { useEffect, useState } from "react";
import { GitPullRequestArrow, Loader2, Plus, Trash2, UsersRound } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TeamMember = {
  name: string;
  title: string;
  user_id: string;
  department: string;
};

type ApprovingAuthority = {
  name: string;
  title: string;
  user_id: string;
  authority: string;
  order: number;
};

type ApprovalChainPayload = {
  org_structure?: TeamMember[];
  approving_authorities?: ApprovingAuthority[];
  cco_name?: string | null;
  cco_email?: string | null;
  assigned_reviewer_name?: string | null;
  assigned_reviewer_email?: string | null;
};

type ApprovalChainResponse = {
  name: string;
  escalation_days: number;
  sla_reminder_days?: number;
  persisted: boolean;
  approval_chain?: ApprovalChainPayload;
};

type ApprovalChainFormFieldsProps = {
  orgId?: string | null;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
};

const blankMember = (): TeamMember => ({ name: "", title: "", user_id: "", department: "" });
const blankAuthority = (order: number): ApprovingAuthority => ({
  name: "",
  title: "",
  user_id: "",
  authority: "POLICY_APPROVAL",
  order
});

export function ApprovalChainForm() {
  if (!isAuthConfigured()) {
    return <ApprovalChainFormFields orgId={getLocalDevOrgId()} />;
  }
  return <AuthedApprovalChainFormFields />;
}

function AuthedApprovalChainFormFields() {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return <ApprovalChainFormFields orgId={orgId} authState={authState} getAuthToken={getAuthToken} />;
}

function ApprovalChainFormFields({ orgId, authState = "ready", getAuthToken }: ApprovalChainFormFieldsProps) {
  const { canDeleteResources } = useMemberCapabilities();
  const [members, setMembers] = useState<TeamMember[]>([blankMember()]);
  const [authorities, setAuthorities] = useState<ApprovingAuthority[]>([blankAuthority(1)]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ApprovalChainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadApprovalChain() {
      if (authState === "loading") {
        return;
      }
      if (authState === "signed-out") {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const token = getAuthToken ? await getAuthToken() : null;
        if (getAuthToken && !token) {
          if (!cancelled) {
            setError("Sign in to load the approval chain.");
            setIsLoading(false);
          }
          return;
        }
        const response = await apiFetch<ApprovalChainResponse>(
          "/api/v1/organizations/current/approval-chain",
          {
            headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId(), "x-user-role": "CCO" }
          },
          { token, orgId }
        );
        if (cancelled) {
          return;
        }
        const chain = response.approval_chain ?? {};
        const loadedMembers = (chain.org_structure ?? []).map((member) => ({
          name: member.name ?? "",
          title: member.title ?? "",
          user_id: member.user_id ?? "",
          department: member.department ?? ""
        }));
        const loadedAuthorities = (chain.approving_authorities ?? []).map((authority, index) => ({
          name: authority.name ?? "",
          title: authority.title ?? "",
          user_id: authority.user_id ?? "",
          authority: authority.authority ?? "POLICY_APPROVAL",
          order: authority.order ?? index + 1
        }));
        setMembers(loadedMembers.length ? loadedMembers : [blankMember()]);
        setAuthorities(loadedAuthorities.length ? loadedAuthorities : [blankAuthority(1)]);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load the approval chain.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadApprovalChain();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getAuthToken is a new arrow each render
  }, [authState, orgId]);

  function updateMember(index: number, field: keyof TeamMember, value: string) {
    setMembers((current) => current.map((member, memberIndex) => memberIndex === index ? { ...member, [field]: value } : member));
  }

  function updateAuthority(index: number, field: keyof ApprovingAuthority, value: string | number) {
    setAuthorities((current) => current.map((authority, authorityIndex) => authorityIndex === index ? { ...authority, [field]: value } : authority));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authState === "loading") {
      setError("Authentication is still loading.");
      return;
    }
    if (authState === "signed-out") {
      setError("Sign in to save the approval chain.");
      return;
    }
    const completedAuthorities = authorities.filter((authority) => authority.name.trim() && authority.title.trim());
    if (!completedAuthorities.length) {
      setError("Add at least one approving authority.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        setError("Sign in to save the approval chain.");
        return;
      }
      const response = await apiFetch<ApprovalChainResponse>(
        "/api/v1/organizations/current/approval-chain",
        {
          method: "PUT",
          body: JSON.stringify({
            org_structure: members.filter((member) => member.name.trim() && member.title.trim()),
            approving_authorities: completedAuthorities.map((authority, index) => ({
              ...authority,
              order: index + 1
            }))
          }),
          headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId(), "x-user-role": "CCO" }
        },
        { token, orgId }
      );
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save the approval chain.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitPullRequestArrow className="h-5 w-5" />
          Organization Structure and Approval Authorities
        </CardTitle>
        <CardDescription>
          Document who owns policy reviews. CCO contact, regulatory sources, and escalation days are
          configured in Organization profile &amp; regulatory scope above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading approval chain…
          </p>
        ) : (
        <form className="grid gap-8" onSubmit={handleSubmit}>
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-base">Organization Structure</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setMembers((current) => [...current, blankMember()])} className="gap-2">
                <Plus className="h-4 w-4" /> Add member
              </Button>
            </div>
            {members.map((member, index) => (
              <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                <Input aria-label={`Member ${index + 1} name`} value={member.name} onChange={(event) => updateMember(index, "name", event.target.value)} placeholder="Name" />
                <Input aria-label={`Member ${index + 1} title`} value={member.title} onChange={(event) => updateMember(index, "title", event.target.value)} placeholder="Title" />
                <Input aria-label={`Member ${index + 1} user ID`} value={member.user_id} onChange={(event) => updateMember(index, "user_id", event.target.value)} placeholder="User ID (optional)" />
                <Input aria-label={`Member ${index + 1} department`} value={member.department} onChange={(event) => updateMember(index, "department", event.target.value)} placeholder="Department (optional)" />
                {canDeleteResources ? (
                <Button type="button" variant="ghost" size="sm" aria-label="Remove member" disabled={members.length === 1} onClick={() => setMembers((current) => current.filter((_, memberIndex) => memberIndex !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                ) : null}
              </div>
            ))}
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-base">Approving authorities</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setAuthorities((current) => [...current, blankAuthority(current.length + 1)])} className="gap-2">
                <Plus className="h-4 w-4" /> Add approver
              </Button>
            </div>
            {authorities.map((authority, index) => (
              <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[0.35fr_1fr_1fr_1fr_1fr_auto]">
                <Input aria-label={`Approver ${index + 1} order`} type="number" min={1} value={authority.order} onChange={(event) => updateAuthority(index, "order", Number(event.target.value))} />
                <Input aria-label={`Approver ${index + 1} name`} value={authority.name} onChange={(event) => updateAuthority(index, "name", event.target.value)} placeholder="Name" />
                <Input aria-label={`Approver ${index + 1} title`} value={authority.title} onChange={(event) => updateAuthority(index, "title", event.target.value)} placeholder="Title" />
                <Input aria-label={`Approver ${index + 1} user ID`} value={authority.user_id} onChange={(event) => updateAuthority(index, "user_id", event.target.value)} placeholder="User ID (optional)" />
                <Input aria-label={`Approver ${index + 1} authority`} value={authority.authority} onChange={(event) => updateAuthority(index, "authority", event.target.value)} placeholder="Authority" />
                {canDeleteResources ? (
                <Button type="button" variant="ghost" size="sm" aria-label="Remove approver" disabled={authorities.length === 1} onClick={() => setAuthorities((current) => current.filter((_, authorityIndex) => authorityIndex !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                ) : null}
              </div>
            ))}
          </section>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {result ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              Approval chain saved for {result.name}.
            </p>
          ) : null}
          <Button type="submit" disabled={isSubmitting || authState !== "ready"} className="w-fit gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
            Save approval chain
          </Button>
        </form>
        )}
      </CardContent>
    </Card>
  );
}
