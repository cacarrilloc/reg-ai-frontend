"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cacheKey, cachedApiFetch, invalidateCache } from "@/lib/api-cache";
import { downloadRevisionRedline, redlineDownloadFilename } from "@/lib/download-revision-redline";
import { getLocalDevOrgId, isAuthConfigured } from "@/lib/auth";
import { useAuthSession } from "@/components/auth/auth-session";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { formatGovRegulationFrameworkLabel, normalizeImpactScore } from "@/lib/gap-analysis-text";
import { TriggerBadge } from "@/components/shared/trigger-badge";
import { isMarketingContentTrigger } from "@/lib/gap-trigger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { formatGapSummaryAsMarkdown } from "@/lib/markdown-format";
import {
  GapFindingsDropdown,
  type GapFindingItem,
} from "@/components/gap-analyses/gap-findings-dropdown";

type ReviewDashboardResponse = {
  pending_revisions: PendingRevision[];
  total_pending: number;
  high_impact_count: number;
  escalated_count: number;
};

type PendingRevision = {
  revision_id: string;
  gap_analysis_id: string;
  policy_id: string;
  policy_name: string;
  impact_score: "HIGH" | "MEDIUM" | "INFO" | string;
  trigger_type: "publication" | "business_change" | string;
  trigger_label: string;
  gap_summary: string;
  rule?: string | null;
  fix?: string | null;
  gap_count?: number;
  gaps?: GapFindingItem[];
  created_at: string;
  days_pending: number;
  redline_url: string | null;
  redline_ready: boolean;
  reviewer_name: string | null;
  reviewer_email: string | null;
  reviewer_user_id?: string | null;
  has_assigned_reviewer?: boolean;
  sla_reminded_at: string | null;
  escalated_at: string | null;
  escalation_days: number | null;
  sla_reminder_days: number | null;
  redline_internal_cosine_similarity: number | null;
  redline_internal_policy_name: string | null;
  redline_regulator_cosine_similarity: number | null;
  redline_regulator_reference_policy_name: string | null;
};

function formatRuleGapFix(revision: Pick<PendingRevision, "rule" | "gap_summary" | "fix">): string {
  const parts: string[] = [];
  if (revision.rule?.trim()) {
    parts.push(`RULE: ${revision.rule.trim()}`);
  }
  if (revision.gap_summary?.trim()) {
    parts.push(`GAP: ${revision.gap_summary.trim()}`);
  }
  if (revision.fix?.trim()) {
    parts.push(`FIX: ${revision.fix.trim()}`);
  }
  return parts.join("\n\n") || revision.gap_summary;
}

type ReviewQueueProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  fallbackMembers?: OrganizationMember[];
};

type Decision =
  | "APPROVED_WITH_EDITS"
  | "APPROVED_ALL_CHANGES"
  | "REJECTED"
  | "APPROVE_REVIEW"
  | "REJECT_REVIEW"
  | "PARTIALLY_ACCEPTED";

type ReviewDecisionResponse = {
  revision_id: string;
  status: string;
  policy_name?: string | null;
  requires_policy_upload?: boolean;
  approval_mode?: string | null;
  policy_version?: number | null;
};

type UploadWarningState = {
  policyName: string;
};

type DecisionConfirmState = {
  revision: PendingRevision;
  decision: Decision;
};

type OrganizationMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type OrganizationMemberListResponse = {
  members: OrganizationMember[];
  total: number;
};

type AssignReviewerResponse = {
  revision_id: string;
  policy_name: string;
  reviewer_user_id: string;
  reviewer_email: string | null;
  reviewer_name: string;
  email_status: string;
  email_subject?: string | null;
  email_error?: string | null;
  email_kind?: string;
  persisted: boolean;
  escalated?: boolean;
  escalated_at?: string | null;
};

function isRedlineReady(revision: PendingRevision): boolean {
  return revision.redline_ready || Boolean(revision.redline_url);
}

function updateRevisionInDashboard(
  dashboard: ReviewDashboardResponse,
  revisionId: string,
  updates: Partial<PendingRevision>
): ReviewDashboardResponse {
  return {
    ...dashboard,
    pending_revisions: dashboard.pending_revisions.map((item) =>
      item.revision_id === revisionId ? { ...item, ...updates } : item
    )
  };
}

export function ReviewQueueWorkspace() {
  if (!isAuthConfigured()) {
    return <ReviewQueueContent orgId={getLocalDevOrgId()} />;
  }

  return <AuthedReviewQueue />;
}

function AuthedReviewQueue() {
  const { authState, getAuthToken, orgId } = useBackendAuth();
  const { user } = useAuthSession();

  const fallbackMembers = useMemo((): OrganizationMember[] => {
    // Always offer the signed-in user while the API member list is loading/empty.
    if (!user?.id) {
      return [];
    }
    const email = user.email || null;
    const fullName = (user.user_metadata?.full_name as string | undefined)?.trim() || "";
    return [
      {
        user_id: user.id,
        email,
        full_name: fullName || email || user.id,
        role: null,
      },
    ];
  }, [user]);

  return (
    <ReviewQueueContent
      authState={authState}
      getAuthToken={getAuthToken}
      orgId={orgId}
      fallbackMembers={fallbackMembers}
    />
  );
}

function ReviewQueueContent({
  authState = "ready",
  getAuthToken,
  orgId,
  fallbackMembers = [],
}: ReviewQueueProps) {
  const [dashboard, setDashboard] = useState<ReviewDashboardResponse | null>(null);
  const notesByRevisionRef = useRef<Record<string, string>>({});
  const dashboardRef = useRef<ReviewDashboardResponse | null>(null);
  const [, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyRevisionId, setBusyRevisionId] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<UploadWarningState | null>(null);
  const [decisionConfirm, setDecisionConfirm] = useState<DecisionConfirmState | null>(null);
  const [apiMembers, setApiMembers] = useState<OrganizationMember[]>([]);
  const [selectedReviewersByRevision, setSelectedReviewersByRevision] = useState<
    Record<string, string>
  >({});
  const [selectedEscalationsByRevision, setSelectedEscalationsByRevision] = useState<
    Record<string, string>
  >({});
  const [isSavingReviewer, setIsSavingReviewer] = useState(false);
  const [isSavingEscalation, setIsSavingEscalation] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);

  dashboardRef.current = dashboard;

  const members = useMemo(() => {
    const byId = new Map<string, OrganizationMember>();
    for (const member of [...fallbackMembers, ...apiMembers]) {
      if (!member.user_id) continue;
      const existing = byId.get(member.user_id);
      byId.set(member.user_id, existing ? preferRicherMember(existing, member) : member);
    }
    return Array.from(byId.values()).sort((left, right) =>
      memberLabel(left).localeCompare(memberLabel(right))
    );
  }, [apiMembers, fallbackMembers]);

  const pending = useMemo(() => dashboard?.pending_revisions ?? [], [dashboard]);
  const awaitingRedline = useMemo(
    () => pending.some((revision) => !isRedlineReady(revision)),
    [pending]
  );

  useEffect(() => {
    if (pending.length === 0) {
      return;
    }
    setSelectedReviewersByRevision((current) => {
      let changed = false;
      const next = { ...current };
      for (const revision of pending) {
        const persisted = (revision.reviewer_user_id || "").trim();
        if (!persisted || next[revision.revision_id] === persisted) {
          continue;
        }
        next[revision.revision_id] = persisted;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [pending]);

  const resolveToken = useCallback(async () => {
    const token = getAuthToken ? await getAuthToken() : null;
    if (getAuthToken && !token) {
      throw new Error("Sign in to manage policy reviews.");
    }
    return token;
  }, [getAuthToken]);

  const loadMembers = useCallback(async () => {
    if (authState !== "ready" || !orgId) {
      return;
    }
    try {
      const token = await resolveToken();
      const response = await apiFetch<OrganizationMemberListResponse>(
        "/api/v1/organizations/current/members",
        undefined,
        { token, orgId }
      );
      setApiMembers(response.members);
      setMembersError(null);
    } catch (caught) {
      // Keep the signed-in-user fallback if the backend list fails.
      setApiMembers([]);
      if (fallbackMembers.length === 0) {
        setMembersError(
          caught instanceof Error ? caught.message : "Unable to load organization members."
        );
      } else {
        setMembersError(null);
      }
    }
  }, [authState, fallbackMembers.length, orgId, resolveToken]);

  const loadQueue = useCallback(async (options?: {
    silent?: boolean;
    kickJobs?: boolean;
    bypassCache?: boolean;
  }) => {
    if (authState === "loading") {
      return;
    }
    if (authState === "signed-out") {
      setDashboard(null);
      setError("Sign in to manage policy reviews.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (!orgId) {
      setDashboard(null);
      setError("Select an organization to load the CCO Review Queue.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const silent = options?.silent ?? Boolean(dashboardRef.current);
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      setError(null);
    }

    // Default off: kick_jobs schedules long redline/embedding work that can stall
    // the API (and --reload) when OpenAI is rate-limited or out of credits.
    const shouldKick = options?.kickJobs === true;
    const params = new URLSearchParams({
      include_findings: "false",
      kick_jobs: shouldKick ? "true" : "false",
    });
    const path = `/api/v1/reviews/pending?${params.toString()}`;

    try {
      const token = await resolveToken();
      const response = await cachedApiFetch(
        cacheKey(`reviews-pending:${orgId}`, orgId),
        () =>
          apiFetch<ReviewDashboardResponse>(path, undefined, {
            token,
            orgId,
            timeoutMs: 45_000,
          }),
        {
          // Polls and kick-jobs must hit the network; initial paint can reuse cache.
          bypass: options?.bypassCache === true || silent || shouldKick,
          ttlMs: 12_000,
        }
      );
      startTransition(() => {
        setDashboard(response);
      });
      if (!silent) {
        setError(null);
      }
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : "Unable to load the CCO Review Queue.");
      }
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [authState, orgId, resolveToken]);

  useEffect(() => {
    void loadQueue({ kickJobs: false, bypassCache: true });
  }, [authState, orgId, loadQueue]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!awaitingRedline || authState !== "ready") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadQueue({ silent: true, kickJobs: false, bypassCache: true });
    }, 8000);

    return () => window.clearInterval(intervalId);
  }, [awaitingRedline, authState, loadQueue]);

  async function downloadRedline(revision: PendingRevision) {
    setMessage(null);
    setError(null);
    setBusyRevisionId(revision.revision_id);
    const filename = redlineDownloadFilename(revision.policy_name);
    setMessage(
      isRedlineReady(revision)
        ? `Preparing redline for ${revision.policy_name}. If storage was out of sync, a fresh draft will be generated automatically.`
        : `Generating and downloading redline for ${revision.policy_name}. This may take up to two minutes.`
    );
    try {
      const token = await resolveToken();
      const result = await downloadRevisionRedline({
        revisionId: revision.revision_id,
        filename,
        token,
        orgId,
      });

      setDashboard((current) =>
        current
          ? updateRevisionInDashboard(current, revision.revision_id, {
              redline_ready: true,
              ...(result.redlineUrl ? { redline_url: result.redlineUrl } : {}),
            })
          : current
      );

      setMessage(`Downloaded redline for ${revision.policy_name}.`);
      void loadQueue({ silent: true, bypassCache: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download redline.");
    } finally {
      setBusyRevisionId(null);
    }
  }

  async function submitDecision(revision: PendingRevision, decision: Decision, dialogNotes?: string) {
    const notes = (dialogNotes ?? notesByRevisionRef.current[revision.revision_id] ?? "").trim();
    if (decisionRequiresNotes(decision) && !notes) {
      setError("Review notes are required before recording this decision.");
      setDecisionConfirm(null);
      return;
    }
    setDecisionConfirm(null);
    setMessage(null);
    setError(null);
    setBusyRevisionId(revision.revision_id);
    try {
      const token = await resolveToken();
      const response = await apiFetch<ReviewDecisionResponse>(
        `/api/v1/reviews/${revision.revision_id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            notes: notes || null
          })
        },
        { token, orgId }
      );
      delete notesByRevisionRef.current[revision.revision_id];
      invalidateCache("/api/v1/reviews/pending");
      invalidateCache("reviews-pending");
      invalidateCache("/api/v1/reviews/audit-chains");
      invalidateCache("/api/v1/reviews/history");
      invalidateCache("/api/v1/marketing/contents");
      if (decision === "APPROVE_REVIEW") {
        setMessage(`${revision.policy_name} was approved and moved to Audit History.`);
      } else if (decision === "REJECT_REVIEW") {
        setMessage(`${revision.policy_name} was rejected and moved to Audit History.`);
      } else if (decision === "PARTIALLY_ACCEPTED") {
        setMessage(`${revision.policy_name} was partially accepted and moved to Audit History.`);
      } else if (decision === "APPROVED_ALL_CHANGES") {
        const versionLabel = response.policy_version
          ? ` as version ${response.policy_version}`
          : "";
        setMessage(
          `${revision.policy_name} was approved with all redline changes accepted and uploaded to the Policy Library${versionLabel}.`
        );
      } else if (decision === "APPROVED_WITH_EDITS") {
        setMessage(
          `${revision.policy_name} was approved with edits and moved to Upload Pending. Upload your edited file to the Policy Library to clear the gap.`
        );
      } else {
        setMessage(`${revision.policy_name} was rejected and removed from the CCO Review Queue.`);
      }
      await loadQueue({ silent: true, bypassCache: true });
      if (
        decision === "APPROVED_WITH_EDITS" &&
        (response.requires_policy_upload ?? true) &&
        !isMarketingRevision(revision)
      ) {
        setUploadWarning({
          policyName: response.policy_name || revision.policy_name,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record the review decision.");
    } finally {
      setBusyRevisionId(null);
    }
  }

  function openDecisionConfirm(revision: PendingRevision, decision: Decision) {
    setError(null);
    setDecisionConfirm({ revision, decision });
  }

  async function assignReviewerToRevision(revision: PendingRevision) {
    const selectedReviewerUserId = selectedReviewersByRevision[revision.revision_id] || "";
    if (!selectedReviewerUserId) {
      setError("Select a reviewer before assigning.");
      return;
    }
    const member = members.find((item) => item.user_id === selectedReviewerUserId);
    if (!member) {
      setError("The selected reviewer is no longer available.");
      return;
    }
    if (!member.email?.trim()) {
      setError("The selected reviewer must have an email address to receive the review request.");
      return;
    }
    setIsSavingReviewer(true);
    setBusyRevisionId(revision.revision_id);
    setError(null);
    try {
      const token = await resolveToken();
      const response = await apiFetch<AssignReviewerResponse>(
        `/api/v1/reviews/${revision.revision_id}/assign-reviewer`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: member.user_id,
            email: member.email,
            full_name: member.full_name || member.email || member.user_id,
          }),
        },
        { token, orgId }
      );
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          pending_revisions: current.pending_revisions.map((item) =>
            item.revision_id === revision.revision_id
              ? {
                  ...item,
                  reviewer_user_id: response.reviewer_user_id,
                  reviewer_name: response.reviewer_name,
                  reviewer_email: response.reviewer_email,
                  has_assigned_reviewer: true,
                }
              : item
          ),
        };
      });
      setSelectedReviewersByRevision((current) => ({
        ...current,
        [revision.revision_id]: response.reviewer_user_id,
      }));
      if (response.email_status === "sent") {
        setMessage(
          `Assigned ${memberLabel(member)} to ${revision.policy_name}. Sent email: “${
            response.email_subject || `Assigned to review redline: ${revision.policy_name}`
          }”.`
        );
      } else if (response.email_status === "skipped") {
        setMessage(
          `Assigned ${memberLabel(member)} to ${revision.policy_name}, but the assignment email was skipped (${
            response.email_error || "email not configured"
          }).`
        );
      } else {
        setMessage(
          `Assigned ${memberLabel(member)} to ${revision.policy_name}, but the assignment email could not be sent${
            response.email_error ? `: ${response.email_error}` : "."
          }`
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to assign reviewer.");
    } finally {
      setIsSavingReviewer(false);
      setBusyRevisionId(null);
    }
  }

  async function escalateReviewerToRevision(revision: PendingRevision) {
    const selectedReviewerUserId = selectedEscalationsByRevision[revision.revision_id] || "";
    if (!selectedReviewerUserId) {
      setError("Select a member to escalate this review to.");
      return;
    }
    if (selectedReviewerUserId === (revision.reviewer_user_id || "").trim()) {
      setError("Choose a different organization member to escalate to.");
      return;
    }
    const member = members.find((item) => item.user_id === selectedReviewerUserId);
    if (!member) {
      setError("The selected member is no longer available.");
      return;
    }
    if (!member.email?.trim()) {
      setError("The selected member must have an email address to receive the review request.");
      return;
    }
    const wasEscalated = Boolean(revision.escalated_at);
    setIsSavingEscalation(true);
    setBusyRevisionId(revision.revision_id);
    setError(null);
    try {
      const token = await resolveToken();
      const response = await apiFetch<AssignReviewerResponse>(
        `/api/v1/reviews/${revision.revision_id}/assign-reviewer`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: member.user_id,
            email: member.email,
            full_name: member.full_name || member.email || member.user_id,
            escalate: true,
          }),
        },
        { token, orgId }
      );
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          escalated_count: wasEscalated
            ? current.escalated_count
            : current.escalated_count + 1,
          pending_revisions: current.pending_revisions.map((item) =>
            item.revision_id === revision.revision_id
              ? {
                  ...item,
                  reviewer_user_id: response.reviewer_user_id,
                  reviewer_name:
                    member.full_name || response.reviewer_name || member.email || member.user_id,
                  reviewer_email: response.reviewer_email || member.email,
                  has_assigned_reviewer: true,
                  escalated_at:
                    response.escalated_at || item.escalated_at || new Date().toISOString(),
                }
              : item
          ),
        };
      });
      setSelectedReviewersByRevision((current) => ({
        ...current,
        [revision.revision_id]: response.reviewer_user_id,
      }));
      setSelectedEscalationsByRevision((current) => ({
        ...current,
        [revision.revision_id]: "",
      }));
      invalidateCache("/api/v1/reviews/pending");
      invalidateCache("reviews-pending");
      await loadQueue({ silent: true, bypassCache: true });
      if (response.email_status === "sent") {
        setMessage(
          `Escalated ${revision.policy_name} to ${memberLabel(member)}. Sent email: “${
            response.email_subject || `Escalated to review redline: ${revision.policy_name}`
          }”.`
        );
      } else if (response.email_status === "skipped") {
        setMessage(
          `Escalated ${revision.policy_name} to ${memberLabel(member)}, but the assignment email was skipped (${
            response.email_error || "email not configured"
          }).`
        );
      } else {
        setMessage(
          `Escalated ${revision.policy_name} to ${memberLabel(member)}, but the assignment email could not be sent${
            response.email_error ? `: ${response.email_error}` : "."
          }`
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to escalate this review.");
    } finally {
      setIsSavingEscalation(false);
      setBusyRevisionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {decisionConfirm ? (
        <ReviewDecisionConfirmDialog
          policyName={decisionConfirm.revision.policy_name}
          decision={decisionConfirm.decision}
          isSubmitting={busyRevisionId === decisionConfirm.revision.revision_id}
          initialNotes={notesByRevisionRef.current[decisionConfirm.revision.revision_id] ?? ""}
          onCancel={() => setDecisionConfirm(null)}
          onConfirm={(notes) => {
            notesByRevisionRef.current[decisionConfirm.revision.revision_id] = notes;
            void submitDecision(decisionConfirm.revision, decisionConfirm.decision, notes);
          }}
        />
      ) : null}
      {uploadWarning ? (
        <UploadApprovedPolicyWarning
          policyName={uploadWarning.policyName}
          onClose={() => setUploadWarning(null)}
        />
      ) : null}
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Pending reviews" value={dashboard?.total_pending ?? 0} />
        <MetricCard label="High impact" value={dashboard?.high_impact_count ?? 0} tone="destructive" />
        <MetricCard label="Escalated" value={dashboard?.escalated_count ?? 0} tone="warning" />
      </section>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Pending Redline Reviews</CardTitle>
            <CardDescription>
            Open redlines, record a decision, and preserve review evidence. Items appear here as soon as you request review from a gap analysis.
          </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadQueue({ silent: Boolean(dashboard), bypassCache: true })}
            disabled={(isLoading || isRefreshing) || authState !== "ready"}
            aria-label="Refresh CCO Review Queue"
          >
            {(isLoading || isRefreshing) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {isLoading && !dashboard ? (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading CCO Review Queue
            </div>
          ) : null}
          {!isLoading && pending.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
              <FileText className="mb-3 h-6 w-6 text-muted-foreground" />
              <p className="font-medium">No pending redlines</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Request review from a HIGH or MEDIUM gap on the Regulatory Compliance Gaps page. The redline draft may take a minute to generate.
              </p>
            </div>
          ) : null}
          {pending.length > 0 ? (
            <div className="space-y-3">
              {pending.map((revision) => {
                const busy = busyRevisionId === revision.revision_id;
                const redlineReady = isRedlineReady(revision);
                const marketingReview = isMarketingRevision(revision);
                const isExpanded = expandedRevisionId === revision.revision_id;
                const govFrameworkLabel = formatGovRegulationFrameworkLabel(
                  revision.redline_regulator_cosine_similarity
                );
                const assignedReviewerId = (
                  revision.reviewer_user_id ||
                  selectedReviewersByRevision[revision.revision_id] ||
                  ""
                ).trim();
                const escalateMembers = members.filter(
                  (member) => member.user_id !== assignedReviewerId
                );
                return (
                  <article
                    key={revision.revision_id}
                    className="min-w-0 overflow-hidden rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedRevisionId(isExpanded ? null : revision.revision_id)
                          }
                        >
                          Details
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </Button>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{revision.policy_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {revision.days_pending}{" "}
                            {revision.days_pending === 1 ? "day" : "days"} pending
                          </p>
                          {govFrameworkLabel ? (
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                              {govFrameworkLabel}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ImpactBadge impact={revision.impact_score} />
                        <TriggerBadge triggerType={revision.trigger_type} />
                        {revision.escalated_at ? (
                          <Badge variant="outline">Escalated</Badge>
                        ) : null}
                        {revision.has_assigned_reviewer ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-foreground text-background"
                          >
                            {`Reviewer: ${queueReviewerLabel(revision, members)}`}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pending assignee</Badge>
                        )}
                        {!redlineReady ? (
                          <Badge variant="outline">Generating redline</Badge>
                        ) : null}
                        {revision.sla_reminded_at ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-foreground text-background"
                          >
                            Reminder sent
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {isExpanded ? (
                      <>
                    <p className="mt-3 text-sm text-muted-foreground">{revision.trigger_label}</p>
                    {!redlineReady ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        The draft is still being built after Request Review. If this badge stays,
                        use Generate & download redline to finish it now.
                      </p>
                    ) : null}

                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
                      <div className="min-w-0 space-y-3">
                        <div className="rounded-md bg-muted/50 p-3">
                          <GapFindingsDropdown
                            gaps={revision.gaps ?? []}
                            gapCount={revision.gap_count}
                            findingsKey={revision.gap_analysis_id}
                            onLoadFindings={async () => {
                              const token = await resolveToken();
                              const detail = await apiFetch<{
                                gaps?: GapFindingItem[];
                              }>(
                                `/api/v1/gap-analyses/${revision.gap_analysis_id}`,
                                undefined,
                                { token, orgId }
                              );
                              return detail.gaps ?? [];
                            }}
                          />
                        </div>
                        {(revision.gap_count ?? 0) === 0 && (revision.gaps?.length ?? 0) === 0 ? (
                          <div className="rounded-md bg-muted/50 p-3">
                            <p className="text-xs font-medium uppercase text-muted-foreground">RULE / GAP / FIX</p>
                            <div className="mt-2">
                              <MarkdownContent
                                text={formatRuleGapFix(revision)}
                                format={formatGapSummaryAsMarkdown}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0 space-y-3">
                        <dl className="grid gap-3 rounded-md bg-muted/30 p-3 text-sm">
                          <div className="min-w-0">
                            <dt className="text-xs font-medium uppercase text-muted-foreground">
                              Assign to
                            </dt>
                            <dd className="mt-1 min-w-0 space-y-2">
                              <div className="flex min-w-0 flex-col gap-2">
                                <select
                                  aria-label="Assigned reviewer"
                                  className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
                                  value={
                                    selectedReviewersByRevision[revision.revision_id] ||
                                    revision.reviewer_user_id ||
                                    ""
                                  }
                                  disabled={
                                    isSavingReviewer ||
                                    isSavingEscalation ||
                                    members.length === 0 ||
                                    busy
                                  }
                                  onChange={(event) =>
                                    setSelectedReviewersByRevision((current) => ({
                                      ...current,
                                      [revision.revision_id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">
                                    {members.length === 0
                                      ? "No organization members available"
                                      : revision.has_assigned_reviewer
                                        ? queueReviewerLabel(revision, members)
                                        : "Select a reviewer…"}
                                  </option>
                                  {members.map((member) => (
                                    <option key={member.user_id} value={member.user_id}>
                                      {memberLabel(member)}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 w-full"
                                  disabled={
                                    busy ||
                                    isSavingReviewer ||
                                    isSavingEscalation ||
                                    !(
                                      selectedReviewersByRevision[revision.revision_id] ||
                                      revision.reviewer_user_id
                                    ) ||
                                    members.length === 0
                                  }
                                  onClick={() => void assignReviewerToRevision(revision)}
                                >
                                  {busy && isSavingReviewer ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Assign"
                                  )}
                                </Button>
                              </div>
                              {isSavingReviewer && busyRevisionId === revision.revision_id ? (
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Sending review request…
                                </p>
                              ) : null}
                              {membersError ? (
                                <p className="text-xs text-destructive">{membersError}</p>
                              ) : null}
                            </dd>
                          </div>
                          {revision.has_assigned_reviewer ? (
                            <div className="min-w-0">
                              <dt className="text-xs font-medium uppercase text-muted-foreground">
                                Escalate to
                              </dt>
                              <dd className="mt-1 min-w-0 space-y-2">
                                <p className="text-xs text-muted-foreground">
                                  If the assigned reviewer cannot complete this review, hand it to
                                  another member.
                                </p>
                                <div className="flex min-w-0 flex-col gap-2">
                                  <select
                                    aria-label="Escalate review to another member"
                                    className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
                                    value={selectedEscalationsByRevision[revision.revision_id] || ""}
                                    disabled={
                                      isSavingReviewer ||
                                      isSavingEscalation ||
                                      escalateMembers.length === 0 ||
                                      busy
                                    }
                                    onChange={(event) =>
                                      setSelectedEscalationsByRevision((current) => ({
                                        ...current,
                                        [revision.revision_id]: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">
                                      {escalateMembers.length === 0
                                        ? "No other members available"
                                        : "Select a member…"}
                                    </option>
                                    {escalateMembers.map((member) => (
                                      <option key={member.user_id} value={member.user_id}>
                                        {memberLabel(member)}
                                      </option>
                                    ))}
                                  </select>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 w-full"
                                    disabled={
                                      busy ||
                                      isSavingReviewer ||
                                      isSavingEscalation ||
                                      !selectedEscalationsByRevision[revision.revision_id] ||
                                      escalateMembers.length === 0
                                    }
                                    onClick={() => void escalateReviewerToRevision(revision)}
                                  >
                                    {busy && isSavingEscalation ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      "Escalate"
                                    )}
                                  </Button>
                                </div>
                                {isSavingEscalation && busyRevisionId === revision.revision_id ? (
                                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Escalating review…
                                  </p>
                                ) : null}
                              </dd>
                            </div>
                          ) : null}
                          <ReviewDetail label="SLA reminder" value={slaLabel(revision)} />
                          <ReviewDetail label="Escalation" value={escalationLabel(revision)} />
                        </dl>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            className="relative w-full justify-center border-foreground"
                            onClick={() => void downloadRedline(revision)}
                            disabled={busy}
                          >
                            <span className="absolute left-3 top-1/2 -translate-y-1/2">
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </span>
                            {busy
                              ? "Preparing redline..."
                              : redlineReady
                                ? "Download redline"
                                : "Generate & download redline"}
                          </Button>
                          <Button
                            variant="outline"
                            className="relative w-full justify-center border-foreground text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                            onClick={() =>
                              openDecisionConfirm(
                                revision,
                                marketingReview ? "APPROVE_REVIEW" : "APPROVED_ALL_CHANGES"
                              )
                            }
                            disabled={busy || !redlineReady}
                          >
                            <span className="absolute left-3 top-1/2 -translate-y-1/2">
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            </span>
                            {marketingReview ? "Approve Review" : "Approve all suggested changes"}
                          </Button>
                          <Button
                            variant="outline"
                            className="relative w-full justify-center border-foreground text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              openDecisionConfirm(
                                revision,
                                marketingReview ? "REJECT_REVIEW" : "REJECTED"
                              )
                            }
                            disabled={busy || !redlineReady}
                          >
                            <span className="absolute left-3 top-1/2 -translate-y-1/2">
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            </span>
                            {marketingReview ? "Reject Review" : "Reject all suggested changes"}
                          </Button>
                          {marketingReview ? (
                            <Button
                              variant="outline"
                              className="relative w-full justify-center border-foreground text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                              onClick={() => openDecisionConfirm(revision, "PARTIALLY_ACCEPTED")}
                              disabled={busy || !redlineReady}
                            >
                              <span className="absolute left-3 top-1/2 -translate-y-1/2">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDot className="h-4 w-4" />}
                              </span>
                              Partially Accepted
                            </Button>
                          ) : (
                            <div className="space-y-1">
                              <Button
                                variant="outline"
                                className="relative w-full justify-center border-foreground text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                                onClick={() => openDecisionConfirm(revision, "APPROVED_WITH_EDITS")}
                                disabled={busy || !redlineReady}
                              >
                                <span className="absolute left-3 top-1/2 -translate-y-1/2">
                                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                </span>
                                Approve with edits
                              </Button>
                              <p className="px-1 text-center text-xs text-amber-700 dark:text-amber-400">
                                Manual upload required
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <Label htmlFor={`review-notes-${revision.revision_id}`}>
                        Review notes{" "}
                        <span className="font-normal text-muted-foreground">
                          {marketingReview
                            ? "(optional)"
                            : "(required for Reject and Approve with edits)"}
                        </span>
                      </Label>
                      <RevisionNotesField
                        revisionId={revision.revision_id}
                        notesRef={notesByRevisionRef}
                        disabled={busy}
                        placeholder={
                          marketingReview
                            ? "Optional — rationale for this marketing review decision"
                            : "Required for Reject / Approve with edits — rationale, evidence, or required manual edits"
                        }
                      />
                    </div>
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewDecisionConfirmDialog({
  policyName,
  decision,
  isSubmitting,
  initialNotes,
  onCancel,
  onConfirm,
}: {
  policyName: string;
  decision: Decision;
  isSubmitting: boolean;
  initialNotes: string;
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}) {
  const copy = decisionConfirmCopy(decision, policyName);
  const notesRequired = decisionRequiresNotes(decision);
  const [notes, setNotes] = useState(initialNotes);
  const [notesError, setNotesError] = useState<string | null>(null);
  const notesInputId = "review-decision-confirm-notes";

  function handleConfirm() {
    const trimmed = notes.trim();
    if (notesRequired && !trimmed) {
      setNotesError("Review notes are required before recording this decision.");
      document.getElementById(notesInputId)?.focus();
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-decision-confirm-title"
      aria-describedby="review-decision-confirm-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className={`w-full max-w-lg rounded-lg border-2 bg-background p-6 shadow-xl ${copy.frameClassName}`}>
        <div className="flex items-start gap-3">
          <copy.Icon className={`mt-0.5 h-6 w-6 shrink-0 ${copy.iconClassName}`} aria-hidden />
          <div className="min-w-0 space-y-3">
            <h2 id="review-decision-confirm-title" className="text-lg font-semibold">
              {copy.title}
            </h2>
            <p id="review-decision-confirm-description" className="text-sm text-muted-foreground">
              {copy.description}
            </p>
            {notesRequired ? (
              <div className="space-y-2">
                <Label htmlFor={notesInputId}>Review notes (required)</Label>
                <Textarea
                  id={notesInputId}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    if (notesError) {
                      setNotesError(null);
                    }
                  }}
                  placeholder="Rationale, evidence, or required manual edits"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(notesError)}
                />
                {notesError ? <p className="text-sm text-destructive">{notesError}</p> : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                className={copy.confirmClassName}
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  copy.confirmLabel
                )}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function decisionConfirmCopy(decision: Decision, policyName: string) {
  if (decision === "APPROVE_REVIEW") {
    return {
      title: "Confirm approve review?",
      description: (
        <>
          You are about to approve the marketing review for <strong>{policyName}</strong>. This item
          leaves the CCO Review Queue and is recorded in Audit History. This cannot be undone.
        </>
      ),
      confirmLabel: "Yes, approve review",
      Icon: CheckCircle2,
      frameClassName: "border-emerald-600",
      iconClassName: "text-emerald-600",
      confirmClassName: "bg-emerald-600 text-white hover:bg-emerald-700",
    };
  }
  if (decision === "REJECT_REVIEW") {
    return {
      title: "Confirm reject review?",
      description: (
        <>
          You are about to reject the marketing review for <strong>{policyName}</strong>. This item
          leaves the CCO Review Queue and is recorded in Audit History. This cannot be undone.
        </>
      ),
      confirmLabel: "Yes, reject review",
      Icon: XCircle,
      frameClassName: "border-destructive",
      iconClassName: "text-destructive",
      confirmClassName: "bg-destructive text-white hover:bg-destructive/90",
    };
  }
  if (decision === "PARTIALLY_ACCEPTED") {
    return {
      title: "Confirm partially accepted?",
      description: (
        <>
          You are about to mark the marketing review for <strong>{policyName}</strong> as partially
          accepted. This item leaves the CCO Review Queue and is recorded in Audit History. This cannot
          be undone.
        </>
      ),
      confirmLabel: "Yes, mark partially accepted",
      Icon: CircleDot,
      frameClassName: "border-amber-500",
      iconClassName: "text-amber-600",
      confirmClassName: "bg-amber-600 text-white hover:bg-amber-700",
    };
  }
  if (decision === "APPROVED_WITH_EDITS") {
    return {
      title: "Confirm approve with edits?",
      description: (
        <>
          You are about to approve <strong>{policyName}</strong> with edits. This moves the item to
          Upload Pending and you must upload your edited policy to the Policy Library to clear the gap.
          This cannot be undone from the CCO Review Queue.
        </>
      ),
      confirmLabel: "Yes, approve with edits",
      Icon: FileText,
      frameClassName: "border-amber-500",
      iconClassName: "text-amber-600",
      confirmClassName: "bg-amber-600 text-white hover:bg-amber-700",
    };
  }
  if (decision === "APPROVED_ALL_CHANGES") {
    return {
      title: "Confirm approve all suggested changes?",
      description: (
        <>
          You are about to accept every suggested change in the redline for{" "}
          <strong>{policyName}</strong>. The cleaned document will be uploaded to the Policy Library as
          a new version and this item will leave the CCO Review Queue. This cannot be undone.
        </>
      ),
      confirmLabel: "Yes, approve all changes",
      Icon: CheckCircle2,
      frameClassName: "border-emerald-600",
      iconClassName: "text-emerald-600",
      confirmClassName: "bg-emerald-600 text-white hover:bg-emerald-700",
    };
  }
  return {
    title: "Confirm reject all suggested changes?",
    description: (
      <>
        You are about to reject all suggested changes for <strong>{policyName}</strong>. The redline
        will be removed from the CCO Review Queue and will not be applied to the Policy Library. Add
        a short rationale below, then confirm. This cannot be undone.
      </>
    ),
    confirmLabel: "Yes, reject all changes",
    Icon: XCircle,
    frameClassName: "border-destructive",
    iconClassName: "text-destructive",
    confirmClassName: "bg-destructive text-white hover:bg-destructive/90",
  };
}

function UploadApprovedPolicyWarning({
  policyName,
  onClose,
}: {
  policyName: string;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="upload-approved-policy-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border-2 border-amber-500 bg-amber-50 p-6 shadow-xl dark:bg-amber-950/40">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 space-y-3">
            <h2 id="upload-approved-policy-title" className="text-lg font-semibold text-amber-950 dark:text-amber-100">
              ⚠️ WARNING: Upload your edited policy now
            </h2>
            <p className="text-sm text-amber-950/90 dark:text-amber-50/90">
              🚨 <strong>{policyName}</strong> is now <strong>Upload Pending</strong>. Reg AI needs you
              to upload the edited policy document to the Policy Library using the same policy name
              (<strong>{policyName}</strong>). After upload, the gap leaves Regulatory Compliance Gaps and
              is retained in Compliance History.
            </p>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              ⏰ Do this immediately. If the file is not uploaded within 2 hours, daily reminder emails
              will be sent to your organization contact until it is uploaded.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => {
                  onClose();
                  router.push(
                    `/policies?upload=1&policy_name=${encodeURIComponent(policyName)}`
                  );
                }}
              >
                Upload to Policy Library
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                I will upload later
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number;
  tone?: "default" | "destructive" | "warning";
}) {
  const className =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${className}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const normalized = normalizeImpactScore(impact);
  const className =
    normalized === "HIGH"
      ? "border-destructive text-destructive"
      : normalized === "MEDIUM"
        ? "border-amber-500 text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";
  return <Badge variant="outline" className={className}>{normalized}</Badge>;
}

function RevisionNotesField({
  revisionId,
  notesRef,
  disabled,
  placeholder,
}: {
  revisionId: string;
  notesRef: MutableRefObject<Record<string, string>>;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [notes, setNotes] = useState(() => notesRef.current[revisionId] ?? "");
  return (
    <Textarea
      id={`review-notes-${revisionId}`}
      value={notes}
      disabled={disabled}
      placeholder={
        placeholder ||
        "Required for Reject / Approve with edits — rationale, evidence, or required manual edits"
      }
      onChange={(event) => {
        const value = event.target.value;
        setNotes(value);
        notesRef.current[revisionId] = value;
      }}
    />
  );
}

function isMarketingRevision(revision: Pick<PendingRevision, "trigger_type">): boolean {
  return isMarketingContentTrigger(revision.trigger_type);
}

function decisionRequiresNotes(decision: Decision): boolean {
  return decision === "REJECTED" || decision === "APPROVED_WITH_EDITS";
}

function queueReviewerLabel(
  revision: PendingRevision,
  orgMembers: OrganizationMember[]
) {
  const reviewerId = (revision.reviewer_user_id || "").trim();
  const member = orgMembers.find((item) => item.user_id === reviewerId);
  if (member) {
    return memberLabel(member);
  }
  return (
    personDisplayName(revision.reviewer_name) ||
    revision.reviewer_email?.trim() ||
    "Assigned"
  );
}

function isOpaqueUserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/** Prefer a real name, then email — never present a raw user id when avoidable. */
function memberLabel(member: OrganizationMember) {
  const rawName = member.full_name?.trim() || "";
  if (rawName && !rawName.includes("@") && !isOpaqueUserId(rawName)) {
    return rawName;
  }
  const email = member.email?.trim();
  if (email) {
    return email;
  }
  // API often copies email into full_name when there is no first/last name.
  if (rawName.includes("@")) {
    return rawName;
  }
  return member.user_id;
}

function memberDisplayRank(member: OrganizationMember): number {
  const rawName = member.full_name?.trim() || "";
  if (rawName && !rawName.includes("@") && !isOpaqueUserId(rawName)) {
    return 3;
  }
  if (member.email?.trim() || rawName.includes("@")) {
    return 2;
  }
  return 1;
}

function preferRicherMember(
  left: OrganizationMember,
  right: OrganizationMember
): OrganizationMember {
  const preferred = memberDisplayRank(right) > memberDisplayRank(left) ? right : left;
  const other = preferred === right ? left : right;
  const nameCandidates = [preferred.full_name, other.full_name]
    .map((value) => value?.trim() || "")
    .filter((value) => value && !isOpaqueUserId(value));
  const properName = nameCandidates.find((value) => !value.includes("@")) || null;
  const emailFromName = nameCandidates.find((value) => value.includes("@")) || null;
  return {
    user_id: preferred.user_id,
    email: preferred.email || other.email || emailFromName,
    full_name: properName || preferred.full_name || other.full_name,
    role: preferred.role || other.role,
  };
}

function personDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  // Never show an email address or raw user id in the Reviewer field.
  if (trimmed.includes("@") || isOpaqueUserId(trimmed)) {
    return null;
  }
  return trimmed;
}

function slaLabel(revision: PendingRevision) {
  if (revision.sla_reminded_at) {
    return `Reminder sent ${formatDate(revision.sla_reminded_at)}`;
  }
  const threshold = revision.sla_reminder_days;
  if (!threshold) {
    return "No reminder threshold configured";
  }
  const remaining = threshold - revision.days_pending;
  if (remaining > 0) {
    return `Remind after ${threshold} days · ${remaining} ${remaining === 1 ? "day" : "days"} left`;
  }
  return `Remind after ${threshold} days · overdue`;
}

function escalationLabel(revision: PendingRevision) {
  if (revision.escalated_at) {
    return `Escalated ${formatDate(revision.escalated_at)}`;
  }
  const threshold = revision.escalation_days;
  if (!threshold) {
    return "No escalation threshold configured";
  }
  const remaining = threshold - revision.days_pending;
  if (remaining > 0) {
    return `Escalates after ${threshold} days · ${remaining} ${remaining === 1 ? "day" : "days"} left`;
  }
  return `Escalates after ${threshold} days · overdue`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
