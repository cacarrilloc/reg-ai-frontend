/**
 * LLM / Model selection: types and pure helpers for the Organization Settings section.
 *
 * One key per provider company (e.g. OpenAI) is shared by every model from that provider.
 */

export type ModelKind = "generation" | "embedding";

export type AIModelItem = {
  provider: string;
  provider_name: string;
  model: string;
  kind: ModelKind;
  capabilities: string[];
  dimensions: number | null;
  is_default: boolean;
  requires_api_base: boolean;
  credential_fields: string[];
  /** Reg-AI default jobs this model covers. */
  default_roles?: Array<"analysis" | "redline" | "embedding">;
};

export type AIModelListResponse = {
  total: number;
  offset: number;
  limit: number;
  items: AIModelItem[];
};

export type AIProviderKey = {
  provider: string;
  provider_name: string;
  key_hint: string;
  api_base: string | null;
  enabled_models: string[];
  updated_at: string | null;
};

export type AIModelSelection = {
  provider: string;
  model: string;
  api_base?: string | null;
  dimensions?: number | null;
};

export type AIMissingCredential = {
  provider: string;
  provider_name: string;
  purpose: "generation" | "embedding" | "analysis" | "redline";
};

/** An embedding-model switch: documents are re-embedded, then the new model takes over. */
export type AIReembedStatus = {
  status: "running" | "swapped" | "completed" | "failed";
  embedding: AIModelSelection;
  total_chunks: number;
  embedded_chunks: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type AISettings = {
  mode: "platform" | "byok";
  mode_label: string;
  billed_to: "reg_ai" | "customer";
  /** Redlines: tracked-change drafts. High volume, so cost and speed matter. */
  generation: AIModelSelection;
  /** Analysis: gap analysis, compliance reports, business-change review. Fewer calls; quality matters more. */
  analysis: AIModelSelection;
  embedding: AIModelSelection;
  configured: boolean;
  credentials: AIProviderKey[];
  missing_credentials?: AIMissingCredential[];
  /** Document chunks embedded with ``embedding``; another embedding model re-embeds them. */
  embedded_chunks?: number;
  embedding_locked?: boolean;
  reembed?: AIReembedStatus | null;
  default_embedding?: AIModelSelection | null;
  default_analysis?: AIModelSelection | null;
  default_redline?: AIModelSelection | null;
};

export type FetchModels = (params: {
  query: string;
  kind: ModelKind | "all";
  offset: number;
  limit: number;
  provider?: string;
}) => Promise<AIModelListResponse>;

/** One provider company and how many of its models match the current search. */
export type AIProviderSummary = {
  provider: string;
  provider_name: string;
  requires_api_base: boolean;
  credential_fields: string[];
  generation_models: number;
  embedding_models: number;
};

export type AIProviderListResponse = {
  total: number;
  items: AIProviderSummary[];
};

export type FetchProviders = (params: {
  query: string;
  kind: ModelKind | "all";
}) => Promise<AIProviderListResponse>;

function searchParams(query: string, kind: ModelKind | "all", params = new URLSearchParams()) {
  if (query.trim()) {
    params.set("q", query.trim());
  }
  if (kind !== "all") {
    params.set("kind", kind);
  }
  return params;
}

export function modelsPath({
  query,
  kind,
  offset,
  limit,
  provider,
}: Parameters<FetchModels>[0]): string {
  const params = searchParams(query, kind, new URLSearchParams({ offset: String(offset), limit: String(limit) }));
  if (provider) {
    params.set("provider", provider);
  }
  return `/api/v1/ai/models?${params.toString()}`;
}

export function providersPath({ query, kind }: Parameters<FetchProviders>[0]): string {
  const params = searchParams(query, kind).toString();
  return `/api/v1/ai/providers${params ? `?${params}` : ""}`;
}

export function providerModelCount(summary: AIProviderSummary): string {
  const parts: string[] = [];
  if (summary.generation_models > 0) {
    parts.push(`${summary.generation_models.toLocaleString()} chat`);
  }
  if (summary.embedding_models > 0) {
    parts.push(`${summary.embedding_models.toLocaleString()} embedding`);
  }
  const total = summary.generation_models + summary.embedding_models;
  return `${parts.join(" · ")} model${total === 1 ? "" : "s"}`;
}

/** One verified provider key assigned to analysis, redlines, or both. */
export type OwnModelAssignment = {
  item: AIModelItem;
  fields: Record<string, string>;
  apiBase: string | null;
};

/** The mandatory AI choice made while registering an organization. */
export type OrganizationAIChoice =
  | { option: "reg_ai_default" }
  | {
      option: "own_key";
      /** ``reg_ai_default`` keeps that job on Reg-AI's model and bill. */
      analysis: OwnModelAssignment | "reg_ai_default";
      redline: OwnModelAssignment | "reg_ai_default";
      /** Omitted or ``reg_ai_default`` keeps document search on Reg-AI's embedding model. */
      embedding?: OwnModelAssignment | "reg_ai_default";
    };

function workflowBody(
  role: "analysis" | "redline" | "embedding",
  assignment: OwnModelAssignment,
  includeFields: boolean
) {
  return {
    role,
    provider: assignment.item.provider,
    model: assignment.item.model,
    ...(includeFields ? { fields: assignment.fields } : {}),
    api_base: assignment.apiBase,
    ...(role === "embedding" && assignment.item.dimensions
      ? { dimensions: assignment.item.dimensions }
      : {}),
  };
}

export function organizationProviderName(choice: OrganizationAIChoice | null): string {
  if (choice?.option !== "own_key") {
    return "provider";
  }
  const slot =
    choice.analysis !== "reg_ai_default"
      ? choice.analysis
      : choice.redline !== "reg_ai_default"
        ? choice.redline
        : choice.embedding && choice.embedding !== "reg_ai_default"
          ? choice.embedding
          : "reg_ai_default";
  return slot === "reg_ai_default" ? "provider" : slot.item.provider_name;
}

export function organizationAISetupBody(choice: OrganizationAIChoice) {
  if (choice.option === "reg_ai_default") {
    return { option: "reg_ai_default", accept_reg_ai_billing: true } as const;
  }
  const workflows = (["analysis", "redline", "embedding"] as const).flatMap((role) => {
    const slot = choice[role];
    return !slot || slot === "reg_ai_default" ? [] : [workflowBody(role, slot, true)];
  });
  return { option: "own_key", workflows } as const;
}

/** After create, the key is already stored server-side — do not send it again. */
export function organizationAISetupCompleteBody(choice: OrganizationAIChoice) {
  if (choice.option === "reg_ai_default") {
    return { option: "reg_ai_default", accept_reg_ai_billing: true } as const;
  }
  const workflows = (["analysis", "redline", "embedding"] as const).flatMap((role) => {
    const slot = choice[role];
    return !slot || slot === "reg_ai_default" ? [] : [workflowBody(role, slot, false)];
  });
  return { option: "own_key", workflows } as const;
}

export const CREDENTIALS_VERIFY_PATH = "/api/v1/ai/credentials/verify";

/** Body for the registration dialog: test the key with the provider, do not store it. */
export function credentialVerifyBody(
  item: AIModelItem,
  fields: Record<string, string>,
  apiBase: string | null
) {
  return {
    provider: item.provider,
    model: item.model,
    kind: item.kind,
    fields,
    api_base: apiBase,
  } as const;
}

export function missingCredentialMessage(missing: AIMissingCredential[]): string | null {
  if (missing.length === 0) {
    return null;
  }
  const label: Record<AIMissingCredential["purpose"], string> = {
    embedding: "Embeddings (document search) need",
    analysis: "Analysis needs",
    redline: "Redlines need",
    generation: "Analysis and redlines need",
  };
  const parts = missing.map((entry) => `${label[entry.purpose]} your ${entry.provider_name} key`);
  return `${parts.join("; ")}. Add the key below, or switch to Reg-AI default models.`;
}

export type ModelRole = "analysis" | "redline" | "embedding";

export const ANALYSIS_TRADEOFF =
  "Gap analysis, compliance reports, and business-change review. These run less often, and each answer has to be right. A stronger model costs more per call and is the better fit.";

export const REDLINE_TRADEOFF =
  "Tracked-change drafts of policy text. These run much more often. A faster, cheaper model keeps drafts affordable.";

export const EMBEDDING_TRADEOFF =
  "Document search. This model turns policies and references into vectors. It is separate from analysis and redlines. Switching it re-embeds documents that are already stored.";

const FIELD_LABELS: Record<string, string> = {
  api_key: "API key",
  aws_access_key_id: "AWS access key ID",
  aws_secret_access_key: "AWS secret access key",
  aws_region_name: "AWS region",
  vertex_credentials: "Service account JSON",
  vertex_project: "Google Cloud project ID",
  vertex_location: "Google Cloud region",
};

const PLAIN_FIELDS = new Set(["aws_region_name", "vertex_project", "vertex_location"]);

export function credentialFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

export function isSecretField(field: string): boolean {
  return !PLAIN_FIELDS.has(field);
}

export function isMultilineField(field: string): boolean {
  return field === "vertex_credentials";
}

export function modelKey(item: Pick<AIModelItem, "provider" | "model" | "kind">): string {
  return `${item.provider}::${item.kind}::${item.model}`;
}

export function providerKeyFor(
  settings: AISettings | null,
  provider: string
): AIProviderKey | undefined {
  return settings?.credentials.find((key) => key.provider === provider);
}

export function isModelEnabled(settings: AISettings | null, item: AIModelItem): boolean {
  return providerKeyFor(settings, item.provider)?.enabled_models.includes(item.model) ?? false;
}

/** Which workflow runs on this model right now, if any. */
export function activeRoles(settings: AISettings | null, item: AIModelItem): ModelRole[] {
  if (!settings) {
    return [];
  }
  const matches = (selection: AIModelSelection) =>
    selection.provider === item.provider && selection.model === item.model;
  const roles: ModelRole[] = [];
  if (item.kind === "generation" && settings.analysis && matches(settings.analysis)) {
    roles.push("analysis");
  }
  if (item.kind === "generation" && matches(settings.generation)) {
    roles.push("redline");
  }
  if (item.kind === "embedding" && matches(settings.embedding)) {
    roles.push("embedding");
  }
  return roles;
}

/** Drop blank values; the key may be empty only when an endpoint URL is given. */
export function buildCredentialPayload(
  requiredFields: string[],
  values: Record<string, string>,
  apiBase: string
): { fields: Record<string, string>; api_base: string | null } | { error: string } {
  const endpoint = apiBase.trim();
  const fields: Record<string, string> = {};
  for (const field of requiredFields) {
    const value = (values[field] ?? "").trim();
    if (value) {
      fields[field] = value;
    }
  }
  const missing = requiredFields.filter((field) => !fields[field]);
  const keylessEndpoint = Boolean(endpoint) && requiredFields.length === 1 && requiredFields[0] === "api_key";
  if (missing.length > 0 && !keylessEndpoint) {
    return { error: `Enter ${missing.map(credentialFieldLabel).join(", ")}.` };
  }
  return { fields, api_base: endpoint || null };
}

/** PUT /ai/settings body that switches one job to ``item`` and keeps the others as they are. */
export function selectionUpdate(
  settings: AISettings | null,
  item: AIModelItem,
  role: ModelRole = item.kind === "embedding" ? "embedding" : "redline"
): { mode: "byok"; generation?: AIModelSelection; analysis?: AIModelSelection; embedding?: AIModelSelection } {
  const chosen: AIModelSelection = {
    provider: item.provider,
    model: item.model,
    dimensions: item.kind === "embedding" ? item.dimensions : null,
  };
  const generation = settings?.generation;
  const analysis = settings?.analysis;
  const embedding = settings?.embedding;
  if (role === "embedding" || item.kind === "embedding") {
    return {
      mode: "byok",
      embedding: chosen,
      ...(generation ? { generation } : {}),
      ...(analysis ? { analysis } : {}),
    };
  }
  if (role === "analysis") {
    return {
      mode: "byok",
      analysis: chosen,
      ...(generation ? { generation } : {}),
      ...(embedding ? { embedding } : {}),
    };
  }
  return {
    mode: "byok",
    generation: chosen,
    ...(analysis ? { analysis } : {}),
    ...(embedding ? { embedding } : {}),
  };
}

export function reembedActive(settings: AISettings | null): boolean {
  const status = settings?.reembed?.status;
  return status === "running" || status === "swapped";
}

/** Choosing this embedding model means re-embedding the org's documents first. */
export function needsReembed(settings: AISettings | null, item: AIModelItem): boolean {
  if (item.kind !== "embedding" || !settings?.embedding_locked) {
    return false;
  }
  return settings.embedding.provider !== item.provider || settings.embedding.model !== item.model;
}

/** Switching to the Reg-AI default models also changes the embedding model. */
export function defaultModelsNeedReembed(settings: AISettings | null): boolean {
  const target = settings?.default_embedding;
  if (!settings?.embedding_locked || !target) {
    return false;
  }
  const current = settings.embedding;
  return (
    current.provider !== target.provider ||
    current.model !== target.model ||
    (current.api_base ?? null) !== (target.api_base ?? null) ||
    (current.dimensions ?? null) !== (target.dimensions ?? null)
  );
}

export function chunkCount(count: number): string {
  return `${count.toLocaleString()} document chunk${count === 1 ? "" : "s"}`;
}

/** Plain-language status line for the embedding switch, or null when there is nothing to show. */
export function reembedMessage(settings: AISettings | null): string | null {
  const job = settings?.reembed;
  if (!job) {
    return null;
  }
  const target = job.embedding.model;
  switch (job.status) {
    case "running":
      return `Re-embedding ${job.embedded_chunks.toLocaleString()} of ${chunkCount(job.total_chunks)} with ${target}. Document search keeps using ${settings.embedding.model} until this finishes.`;
    case "swapped":
      return `Switched to ${target}. Refreshing documents uploaded during the switch.`;
    case "completed":
      return `Embeddings switched to ${target}. ${chunkCount(job.total_chunks)} re-embedded.`;
    case "failed":
      return job.error && /^Switched to the new model/.test(job.error)
        ? job.error
        : `Switching embeddings to ${target} failed${job.error ? `: ${job.error}` : "."} Document search still uses ${settings.embedding.model}.`;
  }
}

export function reembedPercent(job: AIReembedStatus | null | undefined): number {
  if (!job || job.total_chunks <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((job.embedded_chunks / job.total_chunks) * 100));
}

export function friendlyApiError(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : "";
  return message.replace(/^API request failed:\s*/i, "").trim() || fallback;
}

/** User-facing copy when a provider key fails the test request in the model dialog. */
export function keyVerificationError(caught: unknown, providerName: string): string {
  const detail = friendlyApiError(caught, "");
  const lower = detail.toLowerCase();
  if (/billing or quota/.test(lower)) {
    return detail;
  }
  if (/rate-limit/.test(lower)) {
    return detail;
  }
  const looksLikeAuth =
    /invalid or wrong|rejected this api key|authentication failed|not authorized|unauthorized|forbidden|\b401\b|\b403\b/.test(
      lower
    );
  const looksLikeTransport = /method not allowed|\b405\b|\b502\b|\b503\b|\b504\b|unable to reach|networkerror/.test(
    lower
  );
  if (looksLikeAuth && !looksLikeTransport) {
    return `The key you entered was not authorized. Make sure it is the correct ${providerName} key and try again.`;
  }
  if (looksLikeTransport) {
    return `Could not verify this ${providerName} key right now. Try again in a moment.`;
  }
  return `Could not verify this ${providerName} key. Make sure it is the correct key and try again.`;
}

export function canManageAIModels(role: string | null | undefined): boolean {
  const normalized = (role || "").replace(/^org:/, "");
  return normalized === "master_user" || normalized === "chief_compliance_officer";
}
