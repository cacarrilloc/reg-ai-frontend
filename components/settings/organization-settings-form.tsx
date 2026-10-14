"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark, Loader2, Save, Trash2, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { ORGANIZATIONS_CURRENT_LOGO_PATH } from "@/lib/organizations";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { OrganizationLogoAvatar } from "@/components/organizations/organization-logo-avatar";
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

type OrganizationSettingsResponse = {
  id: string;
  auth_org_id: string;
  name: string;
  logo_url?: string | null;
  logo_display_url?: string | null;
  cco_user_id: string | null;
  cco_name: string | null;
  cco_email: string | null;
  regulatory_scope: {
    sources?: string[];
    jurisdictions?: string[];
    products?: string[];
  };
  available_sources: string[];
  escalation_days: number;
  sla_reminder_days: number;
  persisted: boolean;
  bootstrapped?: boolean;
};

type OrganizationSettingsFormProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  orgName?: string | null;
};

const FALLBACK_SOURCES = ["SEC", "FINRA", "CFTC"];

export function OrganizationSettingsForm() {
  if (!isAuthConfigured()) {
    return <OrganizationSettingsFormFields orgId={getLocalDevOrgId()} />;
  }
  return <AuthedOrganizationSettingsForm />;
}

function AuthedOrganizationSettingsForm() {
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  return (
    <OrganizationSettingsFormFields
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
      orgName={orgName}
    />
  );
}

function OrganizationSettingsFormFields({
  authState = "ready",
  getAuthToken,
  orgId,
  orgName,
}: OrganizationSettingsFormProps) {
  const { canDeleteResources } = useMemberCapabilities();
  const [name, setName] = useState(orgName ?? "");
  const [logoDisplayUrl, setLogoDisplayUrl] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([...FALLBACK_SOURCES]);
  const [availableSources, setAvailableSources] = useState<string[]>([...FALLBACK_SOURCES]);
  const [jurisdictions, setJurisdictions] = useState("US");
  const [products, setProducts] = useState("");
  const [ccoUserId, setCcoUserId] = useState("");
  const [ccoName, setCcoName] = useState("");
  const [ccoEmail, setCcoEmail] = useState("");
  const [escalationDays, setEscalationDays] = useState(7);
  const [slaReminderDays, setSlaReminderDays] = useState(3);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLogoBusy, setIsLogoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveToken = useCallback(async () => {
    const token = getAuthToken ? await getAuthToken() : null;
    if (getAuthToken && !token) {
      throw new Error("Sign in to manage organization settings.");
    }
    return token;
  }, [getAuthToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (authState === "loading") {
        return;
      }
      if (authState === "signed-out") {
        setIsLoading(false);
        setError("Sign in to manage organization settings.");
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const token = await resolveToken();
        const [settings, memberList] = await Promise.all([
          apiFetch<OrganizationSettingsResponse>(
            "/api/v1/organizations/current/settings",
            {
              headers: getAuthToken
                ? undefined
                : { "x-org-id": orgId || getLocalDevOrgId(), "x-user-role": "CCO" },
            },
            { token, orgId, orgName }
          ),
          apiFetch<{ members: OrganizationMember[] }>(
            "/api/v1/organizations/current/members",
            {
              headers: getAuthToken
                ? undefined
                : { "x-org-id": orgId || getLocalDevOrgId(), "x-user-role": "CCO" },
            },
            { token, orgId, orgName }
          ).catch(() => ({ members: [] as OrganizationMember[] })),
        ]);
        if (cancelled) {
          return;
        }
        setName(settings.name || orgName || "");
        setLogoDisplayUrl(settings.logo_display_url ?? settings.logo_url ?? null);
        setAvailableSources(
          settings.available_sources?.length ? settings.available_sources : FALLBACK_SOURCES
        );
        setSources(
          settings.regulatory_scope?.sources?.length
            ? settings.regulatory_scope.sources
            : [...FALLBACK_SOURCES]
        );
        setJurisdictions((settings.regulatory_scope?.jurisdictions ?? ["US"]).join(", "));
        setProducts((settings.regulatory_scope?.products ?? []).join(", "));
        setCcoUserId(settings.cco_user_id ?? "");
        setCcoName(settings.cco_name ?? "");
        setCcoEmail(settings.cco_email ?? "");
        setEscalationDays(settings.escalation_days || 7);
        setSlaReminderDays(settings.sla_reminder_days || 3);
        setMembers(memberList.members ?? []);
        if (settings.bootstrapped) {
          setMessage(
            "Created this organization's settings row in Reg-AI. Review the defaults below and save."
          );
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load organization settings."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [authState, getAuthToken, orgId, orgName, resolveToken]);

  const memberOptions = useMemo(
    () =>
      [...members].sort((left, right) =>
        (left.full_name || left.email || left.user_id).localeCompare(
          right.full_name || right.email || right.user_id
        )
      ),
    [members]
  );

  function toggleSource(source: string) {
    setSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source]
    );
  }

  function onCcoSelected(userId: string) {
    setCcoUserId(userId);
    const member = members.find((item) => item.user_id === userId);
    if (!member) {
      return;
    }
    if (member.full_name?.trim()) {
      setCcoName(member.full_name.trim());
    }
    if (member.email?.trim()) {
      setCcoEmail(member.email.trim());
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authState !== "ready") {
      setError("Sign in to save organization settings.");
      return;
    }
    if (!sources.length) {
      setError("Select at least one regulatory source.");
      return;
    }
    if (ccoEmail.trim() && !ccoEmail.includes("@")) {
      setError("Enter a valid CCO email.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const token = await resolveToken();
      const response = await apiFetch<OrganizationSettingsResponse>(
        "/api/v1/organizations/current/settings",
        {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim() || orgName || undefined,
            regulatory_scope: {
              sources,
              jurisdictions: jurisdictions
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              products: products
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            },
            escalation_days: escalationDays,
            cco_user_id: ccoUserId.trim() || null,
            cco_name: ccoName.trim() || null,
            cco_email: ccoEmail.trim() || null,
          }),
          headers: getAuthToken
            ? undefined
            : { "x-org-id": orgId || getLocalDevOrgId(), "x-user-role": "CCO" },
        },
        { token, orgId, orgName }
      );
      setMessage(
        `Saved settings for ${response.name}. Regulatory Feed will use ${
          response.regulatory_scope.sources?.join(", ") || "no sources"
        }.`
      );
      setEscalationDays(response.escalation_days);
      setSlaReminderDays(response.sla_reminder_days);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save organization settings.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setIsLogoBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (authState !== "ready") {
        throw new Error("Sign in to upload an organization logo.");
      }
      const token = await resolveToken();
      if (!token && getAuthToken) {
        throw new Error("Sign in to upload an organization logo.");
      }
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiFetch<{
        logo_url?: string | null;
        logo_display_url?: string | null;
      }>(
        ORGANIZATIONS_CURRENT_LOGO_PATH,
        {
          method: "POST",
          body: formData,
        },
        { token, orgId, orgName }
      );
      const nextUrl = response.logo_display_url ?? response.logo_url ?? null;
      if (!nextUrl) {
        throw new Error("Upload succeeded but no logo URL was returned.");
      }
      setLogoDisplayUrl(nextUrl);
      setMessage("Organization logo updated.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("reg-ai:org-logo-updated"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload logo.");
    } finally {
      setIsLogoBusy(false);
    }
  }

  async function handleLogoRemove() {
    setIsLogoBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await resolveToken();
      await apiFetch(
        ORGANIZATIONS_CURRENT_LOGO_PATH,
        { method: "DELETE" },
        { token, orgId, orgName }
      );
      setLogoDisplayUrl(null);
      setMessage("Organization logo removed.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("reg-ai:org-logo-updated"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove logo.");
    } finally {
      setIsLogoBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          Organization Profile &amp; Regulatory Scope
        </CardTitle>
        <CardDescription>
          Controls which regulator sources appear in the Regulatory Feed, who receives escalations,
          and how long CCO Review Queue items may stay pending before CCO alert.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading organization settings…
          </p>
        ) : (
          <form className="grid gap-8" onSubmit={handleSubmit}>
            <section className="grid gap-4 max-w-xl">
              <div className="grid gap-2">
                <Label htmlFor="org-settings-name">Organization Name</Label>
                <Input
                  id="org-settings-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Firm name"
                />
              </div>
              <div className="grid gap-3 rounded-md border p-4">
                <Label htmlFor="org-logo-upload">Organization logo</Label>
                <div className="flex flex-wrap items-center gap-4">
                  <OrganizationLogoAvatar
                    name={name || "Organization"}
                    logoUrl={logoDisplayUrl}
                    size="lg"
                  />
                  <div className="flex flex-wrap gap-2">
                    <label
                      htmlFor="org-logo-upload"
                      className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground ${
                        isLogoBusy ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      {isLogoBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload logo
                    </label>
                    <input
                      id="org-logo-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="sr-only"
                      disabled={isLogoBusy}
                      onChange={(event) => void handleLogoUpload(event)}
                    />
                    {logoDisplayUrl && canDeleteResources ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        disabled={isLogoBusy}
                        onClick={() => void handleLogoRemove()}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPEG, WebP, GIF, or SVG up to 512KB. Stored on the organization record and
                  shown next to the organization name.
                </p>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {message ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
                ) : null}
              </div>
            </section>

            <section className="grid gap-3">
              <div>
                <Label className="text-base">Regulatory Sources</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only selected sources appear in the Regulatory Feed and scope business-change
                  assessments.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {availableSources.map((source) => {
                  const checked = sources.includes(source);
                  return (
                    <label
                      key={source}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={() => toggleSource(source)}
                      />
                      <span className="font-medium">{source}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="org-settings-jurisdictions">Jurisdictions</Label>
                <Input
                  id="org-settings-jurisdictions"
                  value={jurisdictions}
                  onChange={(event) => setJurisdictions(event.target.value)}
                  placeholder="US"
                  aria-describedby="org-settings-jurisdictions-help"
                />
                <p id="org-settings-jurisdictions-help" className="text-xs text-muted-foreground">
                  Comma-separated. Used as firm context for business-change assessments.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-settings-products">Products / lines of business</Label>
                <Input
                  id="org-settings-products"
                  value={products}
                  onChange={(event) => setProducts(event.target.value)}
                  placeholder="Broker-dealer, advisory"
                  aria-describedby="org-settings-products-help"
                />
                <p id="org-settings-products-help" className="text-xs text-muted-foreground">
                  Optional. Comma-separated product or business lines.
                </p>
              </div>
            </section>

            <section className="grid gap-4 rounded-lg border p-4">
              <div>
                <Label className="text-base">Chief Compliance Officer</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escalation emails and CCO Review Queue fallbacks use this contact. Select an org member
                  when possible so the CCO user ID is stored on the organization.
                </p>
              </div>
              <div className="grid gap-2 max-w-xl">
                <Label htmlFor="org-settings-cco-member">CCO member</Label>
                <select
                  id="org-settings-cco-member"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={ccoUserId}
                  onChange={(event) => onCcoSelected(event.target.value)}
                >
                  <option value="">Select a member…</option>
                  {memberOptions.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email || member.user_id}
                      {member.role ? ` (${member.role})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="org-settings-cco-name">CCO name</Label>
                  <Input
                    id="org-settings-cco-name"
                    value={ccoName}
                    onChange={(event) => setCcoName(event.target.value)}
                    placeholder="Chief Compliance Officer"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="org-settings-cco-email">CCO email</Label>
                  <Input
                    id="org-settings-cco-email"
                    type="email"
                    value={ccoEmail}
                    onChange={(event) => setCcoEmail(event.target.value)}
                    placeholder="cco@firm.com"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid max-w-xs gap-2">
                  <Label htmlFor="org-settings-sla">SLA reminder</Label>
                  <Input
                    id="org-settings-sla"
                    type="number"
                    value={slaReminderDays}
                    disabled
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    Platform default ({slaReminderDays} days).
                  </p>
                </div>
                <div className="grid max-w-xs gap-2">
                  <Label htmlFor="org-settings-escalation">Escalation days</Label>
                  <Input
                    id="org-settings-escalation"
                    type="number"
                    min={1}
                    max={90}
                    value={escalationDays}
                    onChange={(event) => setEscalationDays(Number(event.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Days pending before the CCO receives an escalation alert.
                  </p>
                </div>
              </div>
            </section>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                {message}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting || authState !== "ready"} className="w-fit gap-2">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save organization settings
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
