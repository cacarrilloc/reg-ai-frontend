"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Trash2 } from "lucide-react";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { useBackendAuth } from "@/lib/use-backend-auth";
import {
  deleteOrgSso,
  fetchOrgSso,
  fetchSsoSpInfo,
  isSsoUiEnabled,
  saveOrgSso,
  type SsoConnection,
  type SsoSpInfo,
} from "@/lib/sso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_OPTIONS = [
  { value: "nominated_team_member", label: "Nominated Team Member" },
  { value: "chief_compliance_officer", label: "Chief Compliance Officer" },
  { value: "product_manager", label: "Product Manager" },
  { value: "master_user", label: "Master User" },
];

/** Self-serve enterprise SAML connection + Google/LinkedIn guidance. */
export function SsoSettingsCard() {
  const { authState, getAuthToken, orgId } = useBackendAuth();
  const { canDeleteResources } = useMemberCapabilities();
  const [connection, setConnection] = useState<SsoConnection | null>(null);
  const [spInfo, setSpInfo] = useState<SsoSpInfo | null>(null);
  const [domains, setDomains] = useState("");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [metadataXml, setMetadataXml] = useState("");
  const [ssoOnly, setSsoOnly] = useState(false);
  const [jitEnabled, setJitEnabled] = useState(true);
  const [defaultRole, setDefaultRole] = useState("nominated_team_member");
  const [groupMappingsText, setGroupMappingsText] = useState(
    "Admins=master_user\nCompliance=chief_compliance_officer"
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(true);

  const load = useCallback(async () => {
    if (!isSsoUiEnabled() || authState !== "ready" || !orgId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const [existing, sp] = await Promise.all([
          fetchOrgSso(token, orgId),
          fetchSsoSpInfo(token, orgId),
        ]);
        setCanManage(true);
        setSpInfo(sp);
        setConnection(existing);
        if (existing) {
          setDomains(existing.domains.join(", "));
          setMetadataUrl(existing.metadata_url ?? "");
          setSsoOnly(existing.sso_only);
          setJitEnabled(existing.jit_enabled);
          setDefaultRole(existing.default_role);
          setGroupMappingsText(
            Object.entries(existing.group_role_mappings || {})
              .map(([group, role]) => `${group}=${role}`)
              .join("\n")
          );
        }
      } catch (caught) {
        const text = caught instanceof Error ? caught.message : String(caught);
        if (/403|Insufficient permission/i.test(text)) {
          setCanManage(false);
        } else {
          throw caught;
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load SSO settings.");
    } finally {
      setIsLoading(false);
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isSsoUiEnabled()) {
    return null;
  }

  function parseGroupMappings(raw: string): Record<string, string> {
    const mappings: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const group = trimmed.slice(0, idx).trim();
      const role = trimmed.slice(idx + 1).trim();
      if (group && role) {
        mappings[group] = role;
      }
    }
    return mappings;
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orgId) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Not signed in.");
      }
      const domainList = domains
        .split(/[,\s]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      const saved = await saveOrgSso(token, orgId, {
        domains: domainList,
        metadata_url: metadataUrl.trim() || null,
        metadata_xml: metadataXml.trim() || null,
        sso_only: ssoOnly,
        jit_enabled: jitEnabled,
        default_role: defaultRole,
        group_role_mappings: parseGroupMappings(groupMappingsText),
      });
      setConnection(saved);
      if (saved.status === "active") {
        setMessage("Enterprise SSO connection saved and registered with Supabase.");
      } else {
        setMessage(
          saved.last_error
            ? `Saved locally. Supabase registration pending: ${saved.last_error}`
            : "Saved locally. Enable SAML on your Supabase project, then save again."
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save SSO connection.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete() {
    if (!orgId || !connection) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Not signed in.");
      }
      await deleteOrgSso(token, orgId);
      setConnection(null);
      setMetadataUrl("");
      setMetadataXml("");
      setDomains("");
      setMessage("Enterprise SSO connection removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove SSO connection.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5" />
          Single sign-on
          {connection ? (
            <Badge variant="outline">{connection.status}</Badge>
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Social sign-in uses Google and LinkedIn (enabled in Supabase). Enterprise SAML is
          configured here for your organization domains.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </p>
        ) : null}

        {!isLoading && !canManage ? (
          <p className="text-sm text-muted-foreground">
            You need the Manage enterprise connections permission to configure SSO for this
            organization.
          </p>
        ) : null}

        {!isLoading && canManage ? (
          <>
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Social IdPs</p>
              <p className="mt-1">
                Enable Google and LinkedIn (OIDC) under Supabase Authentication → Providers, and add
                redirect URL <code className="text-xs">/auth/callback</code>.
              </p>
            </div>

            {spInfo ? (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-medium">Service provider details (paste into your IdP)</p>
                <p className="break-all text-muted-foreground">
                  Entity ID: {spInfo.entity_id}
                </p>
                <p className="break-all text-muted-foreground">ACS URL: {spInfo.acs_url}</p>
              </div>
            ) : null}

            <form className="grid gap-3" onSubmit={handleSave}>
              <div className="grid gap-2">
                <Label htmlFor="sso-domains">Email domains</Label>
                <Input
                  id="sso-domains"
                  value={domains}
                  onChange={(event) => setDomains(event.target.value)}
                  placeholder="company.com, company.co.uk"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-metadata-url">IdP metadata URL</Label>
                <Input
                  id="sso-metadata-url"
                  value={metadataUrl}
                  onChange={(event) => setMetadataUrl(event.target.value)}
                  placeholder="https://idp.example.com/metadata.xml"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-metadata-xml">Or IdP metadata XML</Label>
                <textarea
                  id="sso-metadata-xml"
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={metadataXml}
                  onChange={(event) => setMetadataXml(event.target.value)}
                  placeholder="<EntityDescriptor ...>"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-default-role">Default JIT role</Label>
                <select
                  id="sso-default-role"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={defaultRole}
                  onChange={(event) => setDefaultRole(event.target.value)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-group-mappings">Group → role mappings (one per line)</Label>
                <textarea
                  id="sso-group-mappings"
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={groupMappingsText}
                  onChange={(event) => setGroupMappingsText(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={jitEnabled}
                  onChange={(event) => setJitEnabled(event.target.checked)}
                />
                JIT provision members on first SSO login
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ssoOnly}
                  onChange={(event) => setSsoOnly(event.target.checked)}
                />
                Require SSO for these domains (block password sign-in/sign-up)
              </label>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>
              ) : null}
              {connection?.last_error ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Last Supabase error: {connection.last_error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isBusy} className="gap-2">
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save enterprise SSO
                </Button>
                {connection && canDeleteResources ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    className="gap-2"
                    onClick={() => void handleDelete()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </form>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
