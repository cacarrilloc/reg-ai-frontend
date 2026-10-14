"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, History, LibraryBig, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { invalidateCache } from "@/lib/api-cache";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useMemberCapabilities } from "@/lib/member-capabilities";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { PageChromeCard } from "@/components/dashboard/shell";
import {
  tableCellClassName,
  tableFrameClassName,
  tableFrameRowClassName,
  tableFrameTableClassName,
  tableHeadClassName,
} from "@/lib/table-styles";
import { PolicyUploadForm } from "@/components/policies/policy-upload-form";
import { RegulatorySyncButton } from "@/components/regulatory/regulatory-sync-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PolicySummary = {
  id: string;
  org_id: string;
  name: string;
  type: string;
  version: number;
  version_count: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  file_url: string | null;
};

type PolicyLibraryProps = {
  orgId?: string | null;
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  refreshKey?: number;
};

function compareLibraryNames(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}

export function PolicyLibraryWorkspace() {
  const [refreshIndex, setRefreshIndex] = useState(0);

  function refreshLibrary() {
    setRefreshIndex((current) => current + 1);
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <PolicyUploadForm onUploaded={refreshLibrary} />
      </Suspense>
      <PolicyLibrary refreshKey={refreshIndex} />
    </div>
  );
}

function PolicyLibrary({ refreshKey }: { refreshKey?: number }) {
  if (!isAuthConfigured()) {
    return <PolicyLibraryContents orgId={getLocalDevOrgId()} refreshKey={refreshKey} />;
  }
  return <AuthedPolicyLibraryContents refreshKey={refreshKey} />;
}

function AuthedPolicyLibraryContents({ refreshKey }: { refreshKey?: number }) {
  const { authState, getAuthToken, orgId } = useBackendAuth();

  return (
    <PolicyLibraryContents
      orgId={orgId}
      authState={authState}
      getAuthToken={getAuthToken}
      refreshKey={refreshKey}
    />
  );
}

function PolicyLibraryContents({ orgId, authState = "ready", getAuthToken, refreshKey }: PolicyLibraryProps) {
  const { canDeleteResources } = useMemberCapabilities();
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [versions, setVersions] = useState<PolicySummary[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PolicySummary | null>(null);
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null);
  const [downloadingPolicyId, setDownloadingPolicyId] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const loadLibrary = useCallback(async (options?: { silent?: boolean }) => {
    if (authState !== "ready") {
      setPolicies([]);
      setIsLoading(false);
      return;
    }
    const silent = options?.silent ?? hasLoadedOnceRef.current;
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to view the policy library.");
      }
      const headers = getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId() };
      const policyResponse = await apiFetch<PolicySummary[]>(
        "/api/v1/policies",
        { headers },
        { token, orgId },
      );
      setPolicies(policyResponse);
      hasLoadedOnceRef.current = true;
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unable to load the policy library.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary, refreshKey]);

  async function selectPolicy(policyId: string) {
    if (selectedPolicyId === policyId) {
      setSelectedPolicyId(null);
      setVersions([]);
      return;
    }
    setSelectedPolicyId(policyId);
    setIsLoadingVersions(true);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await apiFetch<PolicySummary[]>(
        `/api/v1/policies/${policyId}/versions`,
        { headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId() } },
        { token, orgId }
      );
      setVersions(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load version history.");
    } finally {
      setIsLoadingVersions(false);
    }
  }

  async function downloadPolicy(policyId: string) {
    setError(null);
    setDownloadingPolicyId(policyId);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await apiFetch<{ url: string }>(
        `/api/v1/policies/${policyId}/download-url`,
        { headers: getAuthToken ? undefined : { "x-org-id": orgId || getLocalDevOrgId() } },
        { token, orgId, timeoutMs: 180_000 }
      );
      window.open(response.url, "_blank", "noopener,noreferrer");
      await loadLibrary({ silent: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create a policy download.");
    } finally {
      setDownloadingPolicyId(null);
    }
  }

  async function deleteInternalPolicy(policy: PolicySummary) {
    setError(null);
    setMessage(null);
    setDeletingPolicyId(policy.id);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to delete an internal policy.");
      }
      await apiFetch<void>(
        `/api/v1/policies/${policy.id}`,
        { method: "DELETE" },
        { token, orgId }
      );
      invalidateCache("/api/v1/policies");
      invalidateCache("/api/v1/gap-analyses");
      invalidateCache("/api/v1/reviews/pending");
      setPolicies((current) =>
        current.filter(
          (item) => item.id !== policy.id && item.name.trim().toLowerCase() !== policy.name.trim().toLowerCase()
        )
      );
      setSelectedPolicyId(null);
      setVersions([]);
      await loadLibrary({ silent: true });
      setMessage(`Deleted ${policy.name} and all stored versions.`);
      setDeleteConfirm(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete internal policy.");
    } finally {
      setDeletingPolicyId(null);
    }
  }

  const { internalPolicies, regulationPolicies } = useMemo(() => {
    const internal = policies
      .filter((policy) => policy.type !== "REGULATORY_REFERENCE")
      .sort((left, right) => compareLibraryNames(left.name, right.name));
    const regulations = policies
      .filter((policy) => policy.type === "REGULATORY_REFERENCE")
      .sort((left, right) => compareLibraryNames(left.name, right.name));
    return {
      internalPolicies: internal,
      regulationPolicies: regulations,
    };
  }, [policies]);

  const libraryEmpty =
    !isLoading &&
    authState === "ready" &&
    internalPolicies.length === 0 &&
    regulationPolicies.length === 0;

  return (
    <div className="space-y-6">
      <PageChromeCard
        title={
          <span className="flex items-center gap-2">
            <LibraryBig className="h-5 w-5" />
            Policy library
          </span>
        }
        description="Internal policies and government regulations."
        titleClassName="text-lg"
        actions={
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <RegulatorySyncButton
              authState={authState}
              getAuthToken={getAuthToken}
              orgId={orgId}
              variant="outline"
              onSyncStarted={() => {
                window.setTimeout(() => {
                  void loadLibrary();
                }, 45_000);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => void loadLibrary()} disabled={isLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {deleteConfirm ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="policy-delete-confirm-title"
          aria-describedby="policy-delete-confirm-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border-2 border-destructive bg-background p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-3">
                <h2 id="policy-delete-confirm-title" className="text-lg font-semibold">
                  Delete internal policy?
                </h2>
                <p id="policy-delete-confirm-description" className="text-sm text-muted-foreground">
                  This permanently removes <strong>{deleteConfirm.name}</strong> and every
                  stored version of that policy from the Internal Policy table. Related
                  Internal Policy Gaps and CCO Review Queue items for this policy are also
                  removed. This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => void deleteInternalPolicy(deleteConfirm)}
                    disabled={deletingPolicyId === deleteConfirm.id}
                  >
                    {deletingPolicyId === deleteConfirm.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Yes, delete policy"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteConfirm(null)}
                    disabled={deletingPolicyId === deleteConfirm.id}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {message ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}
      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {authState === "signed-out" ? (
        <PageChromeCard title="Sign in to view the policy library." titleClassName="text-base" />
      ) : null}
      {isLoading ? (
        <PageChromeCard
          title={
            <span className="flex items-center gap-2 text-base">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading library
            </span>
          }
          titleClassName="text-base"
        />
      ) : null}
      {libraryEmpty ? (
        <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
          Upload a policy to start the library.
        </p>
      ) : null}

      {!isLoading && authState === "ready" ? (
        <>
          <PolicyTableCard
            title="Internal Policy"
            description="Uploaded firm policies used for gap analysis and review."
            emptyMessage="No internal policies uploaded yet."
            policies={internalPolicies}
            selectedPolicyId={selectedPolicyId}
            isLoadingVersions={isLoadingVersions}
            versions={versions}
            onSelectPolicy={selectPolicy}
            onDownloadPolicy={downloadPolicy}
            onDeletePolicy={
              canDeleteResources ? (policy) => setDeleteConfirm(policy) : undefined
            }
            deletingPolicyId={deletingPolicyId}
            downloadingPolicyId={downloadingPolicyId}
            nameColumnLabel="Policy"
          />
          <PolicyTableCard
            title="System Regulations"
            description="Scraped FINRA notices, SEC newsroom releases, CFTC press items, and official SEC/FINRA marketing rules."
            emptyMessage="No regulation documents are available yet. Sync regulatory sources to populate this table."
            policies={regulationPolicies}
            selectedPolicyId={selectedPolicyId}
            isLoadingVersions={isLoadingVersions}
            versions={versions}
            onSelectPolicy={selectPolicy}
            onDownloadPolicy={downloadPolicy}
            downloadingPolicyId={downloadingPolicyId}
            nameColumnLabel="Regulation"
          />
        </>
      ) : null}
    </div>
  );
}

type PolicyTableCardProps = {
  title: string;
  description: string;
  emptyMessage: string;
  policies: PolicySummary[];
  selectedPolicyId: string | null;
  isLoadingVersions: boolean;
  versions: PolicySummary[];
  onSelectPolicy: (policyId: string) => void;
  onDownloadPolicy: (policyId: string) => void;
  onDeletePolicy?: (policy: PolicySummary) => void;
  deletingPolicyId?: string | null;
  downloadingPolicyId?: string | null;
  nameColumnLabel: string;
};

function PolicyTableCard({
  title,
  description,
  emptyMessage,
  policies,
  selectedPolicyId,
  isLoadingVersions,
  versions,
  onSelectPolicy,
  onDownloadPolicy,
  onDeletePolicy,
  deletingPolicyId,
  downloadingPolicyId,
  nameColumnLabel,
}: PolicyTableCardProps) {
  const orderedPolicies = [...policies].sort((left, right) =>
    compareLibraryNames(left.name, right.name),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {orderedPolicies.length === 0 ? (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className={`${tableFrameClassName} overflow-x-auto rounded-md border-[3px] border-foreground/35`}>
            <table className={`w-full table-fixed border-collapse text-left text-sm ${tableFrameTableClassName}`}>
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead className={tableHeadClassName}>
                <tr>
                  <th>{nameColumnLabel}</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedPolicies.map((policy) => (
                  <PolicyTableRows
                    key={policy.id}
                    policy={policy}
                    isExpanded={selectedPolicyId === policy.id}
                    isLoadingVersions={isLoadingVersions}
                    versions={selectedPolicyId === policy.id ? versions : []}
                    onSelectPolicy={onSelectPolicy}
                    onDownloadPolicy={onDownloadPolicy}
                    onDeletePolicy={onDeletePolicy}
                    deletingPolicyId={deletingPolicyId}
                    downloadingPolicyId={downloadingPolicyId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type PolicyTableRowsProps = {
  policy: PolicySummary;
  isExpanded: boolean;
  isLoadingVersions: boolean;
  versions: PolicySummary[];
  onSelectPolicy: (policyId: string) => void;
  onDownloadPolicy: (policyId: string) => void;
  onDeletePolicy?: (policy: PolicySummary) => void;
  deletingPolicyId?: string | null;
  downloadingPolicyId?: string | null;
};

function PolicyTableRows({
  policy,
  isExpanded,
  isLoadingVersions,
  versions,
  onSelectPolicy,
  onDownloadPolicy,
  onDeletePolicy,
  deletingPolicyId,
  downloadingPolicyId,
}: PolicyTableRowsProps) {
  return (
    <>
      <tr className={tableFrameRowClassName}>
        <td className={`px-3 py-4 font-medium ${tableCellClassName}`}>
          <div className="break-words">{policy.name}</div>
        </td>
        <td className={`px-3 py-4 ${tableCellClassName}`}>{policy.version}</td>
        <td className={`px-3 py-4 ${tableCellClassName}`}>
          <StatusBadge status={policy.status} />
        </td>
        <td className={`whitespace-nowrap px-3 py-4 text-muted-foreground ${tableCellClassName}`}>
          {formatDate(policy.updated_at)}
        </td>
        <td className={`px-3 py-4 ${tableCellClassName}`}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onSelectPolicy(policy.id)}
              className="gap-2"
            >
              <History className="h-4 w-4" />
              {policy.version_count}
            </Button>
            {policy.file_url || policy.type === "REGULATORY_REFERENCE" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onDownloadPolicy(policy.id)}
                disabled={downloadingPolicyId === policy.id}
                aria-label={`Open ${policy.name}`}
              >
                {downloadingPolicyId === policy.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            ) : null}
            {onDeletePolicy ? (
              <Button
                variant="outline"
                size="sm"
                className="border-foreground text-destructive hover:bg-destructive/10"
                onClick={() => onDeletePolicy(policy)}
                disabled={deletingPolicyId === policy.id}
                aria-label={`Delete ${policy.name}`}
              >
                {deletingPolicyId === policy.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </div>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b bg-muted/30">
          <td colSpan={5} className="px-3 py-4">
            <p className="mb-3 text-sm font-medium">Version history</p>
            {isLoadingVersions ? <p className="text-sm text-muted-foreground">Loading versions…</p> : null}
            {!isLoadingVersions && versions.length > 0 ? (
              <div className={tableFrameClassName}>
                <table className={`w-full text-sm ${tableFrameTableClassName}`}>
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 text-left font-medium">Version</th>
                      <th className="px-2 py-2 text-left font-medium">Status</th>
                      <th className="px-2 py-2 text-left font-medium">Created</th>
                      <th className="px-2 py-2 text-right font-medium">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((version) => (
                      <tr key={version.id} className="border-t border-border/60">
                        <td className="px-2 py-2">Version {version.version}</td>
                        <td className="px-2 py-2">
                          <StatusBadge status={version.status} />
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{formatDate(version.created_at)}</td>
                        <td className="px-2 py-2 text-right">
                          {version.file_url || version.type === "REGULATORY_REFERENCE" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void onDownloadPolicy(version.id)}
                              disabled={downloadingPolicyId === version.id}
                            >
                              {downloadingPolicyId === version.id ? "Preparing…" : "Download"}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const filled = status === "ACTIVE";
  return (
    <Badge
      variant="outline"
      className={filled ? "border-transparent bg-foreground text-background" : undefined}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "Date pending";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
