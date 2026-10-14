"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Bot, CheckCircle2, KeyRound, Loader2, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  activeRoles,
  buildCredentialPayload,
  canManageAIModels,
  chunkCount,
  defaultModelsNeedReembed,
  friendlyApiError,
  isModelEnabled,
  keyVerificationError,
  missingCredentialMessage,
  modelKey,
  modelsPath,
  needsReembed,
  providerKeyFor,
  providersPath,
  reembedActive,
  reembedMessage,
  reembedPercent,
  selectionUpdate,
  ANALYSIS_TRADEOFF,
  EMBEDDING_TRADEOFF,
  REDLINE_TRADEOFF,
  type AIModelItem,
  type AIModelListResponse,
  type AIProviderListResponse,
  type AISettings,
  type FetchModels,
  type FetchProviders,
} from "@/lib/ai-models";
import { fetchCurrentMembership } from "@/lib/member-capabilities";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { ModelList, kindLabel } from "@/components/ai/model-list";
import { ProviderKeyFields } from "@/components/ai/provider-key-fields";
import { RegAIBillingDialog } from "@/components/ai/reg-ai-billing-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const ROLE_LABELS = {
  analysis: "analysis",
  redline: "redlines",
  embedding: "embeddings",
} as const;

const JSON_HEADERS = { "Content-Type": "application/json" };
const REEMBED_POLL_MS = 3000;

/**
 * LLM / Model selection. Reg-AI default models (billed by Reg-AI) or any LiteLLM model on the
 * org's own provider key, stored once per provider in the org's own tenant schema.
 */
export function AIModelSelectionCard() {
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [dialogItem, setDialogItem] = useState<AIModelItem | null>(null);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingPending, setBillingPending] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getAuthToken();
      return apiFetch<T>(path, init, { token, orgId, orgName });
    },
    [getAuthToken, orgId, orgName]
  );

  const loadSettings = useCallback(async () => {
    setSettings(await request<AISettings>("/api/v1/ai/settings"));
  }, [request]);

  const fetchModels = useCallback<FetchModels>(
    (params) => request<AIModelListResponse>(modelsPath(params)),
    [request]
  );

  const fetchProviders = useCallback<FetchProviders>(
    (params) => request<AIProviderListResponse>(providersPath(params)),
    [request]
  );

  useEffect(() => {
    let cancelled = false;
    async function checkAccess() {
      if (authState !== "ready" || !orgId) {
        setVisible(false);
        return;
      }
      try {
        const token = await getAuthToken();
        const me = await fetchCurrentMembership({ token, orgId, orgName });
        if (cancelled) {
          return;
        }
        const allowed = canManageAIModels(me.role);
        setVisible(allowed);
        if (allowed) {
          await loadSettings();
        }
      } catch (caught) {
        if (!cancelled) {
          const message = friendlyApiError(caught, "Unable to load AI model settings.");
          setVisible(!/403|Only Master and CCO/i.test(message));
          setError(message);
        }
      }
    }
    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [authState, getAuthToken, loadSettings, orgId, orgName, request]);

  const switching = reembedActive(settings);

  useEffect(() => {
    if (!switching) {
      return;
    }
    const timer = window.setInterval(() => {
      loadSettings().catch(() => undefined);
    }, REEMBED_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadSettings, switching]);

  async function setModelEnabled(item: AIModelItem, enabled: boolean) {
    setPendingKey(modelKey(item));
    setError(null);
    setNotice(null);
    try {
      await request(`/api/v1/ai/credentials/${encodeURIComponent(item.provider)}/models`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ model: item.model, enabled }),
      });
      await loadSettings();
    } catch (caught) {
      setError(friendlyApiError(caught, "Unable to update that model."));
    } finally {
      setPendingKey(null);
    }
  }

  function handleToggle(item: AIModelItem, next: boolean) {
    if (next && !providerKeyFor(settings, item.provider)) {
      setDialogItem(item);
      return;
    }
    void setModelEnabled(item, next);
  }

  const regAiDefaultSelected = settings ? settings.mode === "platform" : false;

  const defaultsReembed = defaultModelsNeedReembed(settings);

  function handleRegAiDefaultToggle(next: boolean) {
    setNotice(null);
    if (switching) {
      setNotice("Wait for the embedding switch to finish before changing models.");
      return;
    }
    if (next && !regAiDefaultSelected) {
      setBillingError(null);
      setBillingOpen(true);
    } else if (!next && regAiDefaultSelected) {
      setNotice(
        'To stop using Reg-AI default models, open a model below, add its provider key, and choose "Use this model".'
      );
    }
  }

  async function acceptRegAiBilling() {
    setBillingPending(true);
    setBillingError(null);
    try {
      const next = await request<AISettings>("/api/v1/ai/settings/use-default-models", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ accept_reg_ai_billing: true, reembed: defaultsReembed }),
      });
      setSettings(next);
      setBillingOpen(false);
      setNotice(
        reembedActive(next)
          ? "Re-embedding your documents for the Reg-AI default models. Your current models stay in use until it finishes."
          : "Reg-AI default models selected. Usage is recorded for Reg-AI billing."
      );
    } catch (caught) {
      setBillingError(friendlyApiError(caught, "Unable to switch to Reg-AI default models."));
    } finally {
      setBillingPending(false);
    }
  }

  if (!visible) {
    return null;
  }

  const missingMessage = missingCredentialMessage(settings?.missing_credentials ?? []);

  return (
    <Card id="llm-model-selection">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          LLM / Model Selection
        </CardTitle>
        <CardDescription>
          Analysis and redlines are chosen separately. Analysis runs less often and rewards a stronger
          model. Redlines run much more often, so a faster, cheaper model keeps the cost down. Use the
          Reg-AI pair, billed by Reg-AI, or your own provider key. One key covers every model from that
          provider. Keys stay encrypted in this organization&apos;s private database. Master and CCO
          users can manage models.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <WorkflowSummary
              title="Analysis"
              model={settings.analysis.model}
              body={ANALYSIS_TRADEOFF}
              note={slotNote(settings, settings.analysis, settings.default_analysis)}
            />
            <WorkflowSummary
              title="Redlines"
              model={settings.generation.model}
              body={REDLINE_TRADEOFF}
              note={slotNote(settings, settings.generation, settings.default_redline)}
            />
            <div className="flex justify-center sm:col-span-2">
              <div className="w-full sm:w-[calc(50%-0.25rem)]">
                <WorkflowSummary
                  title="Embeddings"
                  model={settings.embedding.model}
                  body={EMBEDDING_TRADEOFF}
                  note={slotNote(settings, settings.embedding, settings.default_embedding)}
                />
              </div>
            </div>
          </div>
        ) : null}

        {settings ? <ReembedBanner settings={settings} /> : null}

        {missingMessage ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            {missingMessage}
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <ModelList
          fetchProviders={fetchProviders}
          fetchModels={fetchModels}
          renderProviderBadges={(provider) => <ProviderStatus settings={settings} provider={provider.provider} />}
          regAiDefaultSelected={regAiDefaultSelected}
          onRegAiDefaultToggle={handleRegAiDefaultToggle}
          regAiDefaultPending={billingPending}
          regAiDefaultDescription="Balanced pair, billed by Reg-AI. Analysis uses a stronger Claude model. Redlines use a faster, cheaper Claude model. Embeddings use OpenAI."
          isModelOn={(item) => isModelEnabled(settings, item)}
          onOpenModel={setDialogItem}
          onToggleModel={handleToggle}
          pendingModelKey={pendingKey}
          onRefresh={loadSettings}
          renderBadges={(item) => (
            <>
              <DefaultRoleBadges item={item} />
              {(settings?.mode === "byok" ? activeRoles(settings, item) : []).map((role) => (
                <Badge key={role} className="px-1.5 py-0 text-[10px]">
                  {ROLE_LABELS[role]}
                </Badge>
              ))}
              {switching &&
              item.kind === "embedding" &&
              settings?.reembed?.embedding.provider === item.provider &&
              settings.reembed.embedding.model === item.model ? (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Re-embedding
                </Badge>
              ) : null}
            </>
          )}
        />
      </CardContent>

      <RegAIBillingDialog
        open={billingOpen}
        onOpenChange={setBillingOpen}
        onAccept={acceptRegAiBilling}
        isPending={billingPending}
        error={billingError}
        reembedNotice={
          settings && defaultsReembed
            ? `Your ${chunkCount(settings.embedded_chunks ?? 0)} are embedded with ${settings.embedding.model}. Switching re-embeds them with ${settings.default_embedding?.model ?? "the Reg-AI default"}, billed by Reg-AI. Your current models stay in use until that finishes, usually within a few minutes.`
            : null
        }
      />

      {dialogItem ? (
        <ProviderKeyDialog
          item={dialogItem}
          settings={settings}
          request={request}
          onSettingsChange={setSettings}
          reloadSettings={loadSettings}
          onClose={() => setDialogItem(null)}
        />
      ) : null}
    </Card>
  );
}

type ProviderKeyDialogProps = {
  item: AIModelItem;
  settings: AISettings | null;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onSettingsChange: (settings: AISettings) => void;
  reloadSettings: () => Promise<void>;
  onClose: () => void;
};

function ProviderKeyDialog({
  item,
  settings,
  request,
  onSettingsChange,
  reloadSettings,
  onClose,
}: ProviderKeyDialogProps) {
  const providerKey = providerKeyFor(settings, item.provider);
  const enabled = isModelEnabled(settings, item);
  const roles = settings?.mode === "byok" ? activeRoles(settings, item) : [];
  const reembed = needsReembed(settings, item);
  const switching = reembedActive(settings);
  const [confirmingReembed, setConfirmingReembed] = useState(false);
  const [replacing, setReplacing] = useState(!providerKey);
  const [values, setValues] = useState<Record<string, string>>({});
  const [apiBase, setApiBase] = useState(providerKey?.api_base ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const providerPath = `/api/v1/ai/credentials/${encodeURIComponent(item.provider)}`;

  async function run(
    action: string,
    work: () => Promise<void>,
    onError: string | ((caught: unknown) => string)
  ) {
    setPending(action);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setError(typeof onError === "function" ? onError(caught) : friendlyApiError(caught, onError));
    } finally {
      setPending(null);
    }
  }

  function toggleModel(next: boolean) {
    return run(
      "toggle",
      async () => {
        await request(`${providerPath}/models`, {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ model: item.model, enabled: next }),
        });
        await reloadSettings();
      },
      "Unable to update that model."
    );
  }

  function saveKey() {
    const payload = buildCredentialPayload(item.credential_fields, values, apiBase);
    if ("error" in payload) {
      setError(payload.error);
      return;
    }
    if (item.requires_api_base && !payload.api_base) {
      setError(`${item.provider_name} needs an endpoint URL.`);
      return;
    }
    return run(
      "save",
      async () => {
        await request(providerPath, {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ ...payload, model: item.model, kind: item.kind }),
        });
        await request(`${providerPath}/models`, {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ model: item.model, enabled: true }),
        });
        await reloadSettings();
        setValues({});
        setReplacing(false);
        setNotice(`${item.provider_name} accepted this key. It is saved and ${item.model} is on.`);
      },
      (caught) => keyVerificationError(caught, item.provider_name)
    );
  }

  function removeKey() {
    if (
      !window.confirm(
        `Remove this organization's ${item.provider_name} key? Every ${item.provider_name} model will be turned off.`
      )
    ) {
      return;
    }
    return run(
      "remove",
      async () => {
        await request(providerPath, { method: "DELETE" });
        await reloadSettings();
        setReplacing(true);
        setNotice(`${item.provider_name} key removed.`);
      },
      "Unable to remove that key."
    );
  }

  function selectModel(withReembed: boolean, role: "analysis" | "redline" | "embedding" = "embedding") {
    const job = role === "embedding" ? "embeddings" : role === "analysis" ? "analysis" : "redlines";
    return run(
      "use",
      async () => {
        onSettingsChange(
          await request<AISettings>("/api/v1/ai/settings", {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              ...selectionUpdate(settings, item, role),
              ...(withReembed ? { reembed: true } : {}),
            }),
          })
        );
        setConfirmingReembed(false);
        setNotice(
          withReembed
            ? `Re-embedding started. ${item.model} takes over document search when it finishes.`
            : `${item.model} now runs ${job}.`
        );
      },
      "Unable to select that model."
    );
  }

  const embeddedChunks = chunkCount(settings?.embedded_chunks ?? 0);
  const selectionHelp =
    roles.length > 0
      ? "This model is in use."
      : switching
        ? "An embedding switch is in progress. Model changes are paused until it finishes."
        : reembed
          ? `Your ${embeddedChunks} are embedded with ${settings?.embedding.model}. Switching re-embeds them with this model first.`
          : item.kind === "embedding"
            ? "Used for document search. No documents are embedded yet, so you can switch freely."
            : "Choose this model for analysis, redlines, or both. Each job is billed on its own.";

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-background p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="break-all text-lg font-semibold">{item.model}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {item.provider_name} · {kindLabel(item)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4" />
                  {item.provider_name} key
                </p>
                {providerKey ? (
                  <span className="text-xs text-muted-foreground">
                    {providerKey.key_hint} · used by {providerKey.enabled_models.length} model
                    {providerKey.enabled_models.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not connected</span>
                )}
              </div>

              {replacing ? (
                <div className="mt-4 space-y-3">
                  <ProviderKeyFields
                    item={item}
                    values={values}
                    onValuesChange={setValues}
                    apiBase={apiBase}
                    onApiBaseChange={setApiBase}
                    disabled={Boolean(pending)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Before saving, Reg-AI sends one tiny test request to {item.provider_name} with this key.
                    Keys {item.provider_name} rejects are never saved.
                  </p>
                  <div className="flex justify-end gap-2">
                    {providerKey ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReplacing(false)}
                        disabled={Boolean(pending)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" onClick={() => void saveKey()} disabled={Boolean(pending)}>
                      {pending === "save" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      {pending === "save" ? "Testing key…" : providerKey ? "Replace key" : "Save key & turn on"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReplacing(true)}
                    disabled={Boolean(pending)}
                  >
                    Replace key
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => void removeKey()}
                    disabled={Boolean(pending)}
                  >
                    {pending === "remove" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Remove key
                  </Button>
                </div>
              )}
            </div>

            {providerKey ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Model available to this organization</p>
                  <p className="text-xs text-muted-foreground">
                    Turned-on models can be chosen for analysis, redlines, or embeddings.
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  disabled={Boolean(pending)}
                  aria-label={`${enabled ? "Turn off" : "Turn on"} ${item.model}`}
                  onCheckedChange={(next) => void toggleModel(next)}
                />
              </div>
            ) : null}

            {providerKey && enabled && item.kind === "embedding" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Embeddings</p>
                  <p className="text-xs text-muted-foreground">{selectionHelp}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => (reembed ? setConfirmingReembed(true) : void selectModel(false))}
                  disabled={Boolean(pending) || roles.includes("embedding") || switching || confirmingReembed}
                >
                  {pending === "use" && !reembed ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {roles.includes("embedding") ? "In use" : reembed ? "Re-embed & switch" : "Use for embeddings"}
                </Button>
              </div>
            ) : null}

            {providerKey && enabled && item.kind === "generation" ? (
              <div className="space-y-2">
                <JobChoice
                  title="Analysis"
                  body={ANALYSIS_TRADEOFF}
                  inUse={roles.includes("analysis")}
                  pending={pending === "use"}
                  disabled={Boolean(pending) || roles.includes("analysis") || switching}
                  onUse={() => void selectModel(false, "analysis")}
                />
                <JobChoice
                  title="Redlines"
                  body={REDLINE_TRADEOFF}
                  inUse={roles.includes("redline")}
                  pending={pending === "use"}
                  disabled={Boolean(pending) || roles.includes("redline") || switching}
                  onUse={() => void selectModel(false, "redline")}
                />
              </div>
            ) : null}

            {confirmingReembed && reembed && !switching ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <p className="font-medium">
                  Re-embed {embeddedChunks} with {item.model}?
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    Every chunk is sent to {item.provider_name} once, billed to your {item.provider_name} key.
                  </li>
                  <li>
                    Document search keeps using {settings?.embedding.model} until re-embedding finishes,
                    usually within a few minutes. You can leave this page.
                  </li>
                  <li>Model changes are paused meanwhile. If it fails, nothing changes.</li>
                </ul>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingReembed(false)}
                    disabled={Boolean(pending)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={() => void selectModel(true)} disabled={Boolean(pending)}>
                    {pending === "use" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Start re-embedding
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
              >
                <p className="font-medium">Key verification failed</p>
                <p className="mt-1">{error}</p>
              </div>
            ) : null}
            {notice ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800"
              >
                <p className="font-medium">Key verified</p>
                <p className="mt-1">{notice}</p>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function slotNote(
  settings: AISettings,
  selection: { provider: string; model: string },
  platformDefault: { provider: string; model: string } | null | undefined
): string {
  const onDefault =
    platformDefault != null &&
    selection.provider === platformDefault.provider &&
    selection.model === platformDefault.model;
  if (settings.mode === "platform" || (onDefault && !providerKeyFor(settings, selection.provider))) {
    return "Reg-AI default. Billed by Reg-AI.";
  }
  return "Your model. Billed by your provider.";
}

function WorkflowSummary({
  title,
  model,
  body,
  note,
}: {
  title: string;
  model: string;
  body: string;
  note: string;
}) {
  return (
    <article className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <p className="font-medium">
        {title} · <span className="font-normal">{model}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </article>
  );
}

function DefaultRoleBadges({ item }: { item: AIModelItem }) {
  const roles = item.default_roles ?? [];
  const labels: Record<string, string> = {
    analysis: "reg-ai-default-analysis",
    redline: "reg-ai-default-redlines",
    embedding: "embeddings",
  };
  if (roles.length === 0) {
    return item.is_default && item.kind === "generation" ? (
      <>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          reg-ai-default-analysis
        </Badge>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          reg-ai-default-redlines
        </Badge>
      </>
    ) : null;
  }
  return (
    <>
      {roles
        .filter((role) => role === "analysis" || role === "redline" || role === "embedding")
        .map((role) => (
          <Badge key={role} variant="outline" className="px-1.5 py-0 text-[10px]">
            {labels[role]}
          </Badge>
        ))}
    </>
  );
}

function JobChoice({
  title,
  body,
  inUse,
  pending,
  disabled,
  onUse,
}: {
  title: string;
  body: string;
  inUse: boolean;
  pending: boolean;
  disabled: boolean;
  onUse: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      <Button type="button" size="sm" onClick={onUse} disabled={disabled}>
        {pending && !inUse ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
        {inUse ? "In use" : `Use for ${title.toLowerCase()}`}
      </Button>
    </div>
  );
}

/** Provider row status: workflows it runs, an embedding switch to it, and its stored key. */
function ProviderStatus({ settings, provider }: { settings: AISettings | null; provider: string }) {
  const key = providerKeyFor(settings, provider);
  const roles =
    settings?.mode === "byok"
      ? (["analysis", "redline", "embedding"] as const).filter((role) => {
          if (role === "analysis") {
            return settings.analysis.provider === provider;
          }
          if (role === "redline") {
            return settings.generation.provider === provider;
          }
          return settings.embedding.provider === provider;
        })
      : [];
  const reembedding = reembedActive(settings) && settings?.reembed?.embedding.provider === provider;
  return (
    <>
      {roles.map((role) => (
        <Badge key={role} className="px-1.5 py-0 text-[10px]">
          {ROLE_LABELS[role]}
        </Badge>
      ))}
      {reembedding ? (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          Re-embedding
        </Badge>
      ) : null}
      {key ? (
        <Badge variant="outline" className="gap-1 font-normal">
          <KeyRound className="h-3 w-3" />
          {key.key_hint} · {key.enabled_models.length} on
        </Badge>
      ) : null}
    </>
  );
}

function ReembedBanner({ settings }: { settings: AISettings }) {
  const job = settings.reembed;
  const message = reembedMessage(settings);
  if (!job || !message) {
    return null;
  }
  if (job.status === "failed") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        {message}
      </p>
    );
  }
  if (job.status === "completed") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        {message}
      </p>
    );
  }
  const percent = job.status === "swapped" ? 100 : reembedPercent(job);
  return (
    <div className="rounded-lg border px-4 py-3 text-sm" role="status" aria-live="polite">
      <p className="flex items-start gap-2">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        {message}
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
