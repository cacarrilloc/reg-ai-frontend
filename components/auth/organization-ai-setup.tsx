"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Bot, CheckCircle2, KeyRound, Loader2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  ANALYSIS_TRADEOFF,
  buildCredentialPayload,
  CREDENTIALS_VERIFY_PATH,
  credentialVerifyBody,
  keyVerificationError,
  modelKey,
  modelsPath,
  providersPath,
  REDLINE_TRADEOFF,
  type AIModelItem,
  type AIModelListResponse,
  type AIProviderListResponse,
  type FetchModels,
  type FetchProviders,
  type OrganizationAIChoice,
  type OwnModelAssignment,
} from "@/lib/ai-models";
import { ModelList, kindLabel } from "@/components/ai/model-list";
import { ProviderKeyFields } from "@/components/ai/provider-key-fields";
import { RegAIBillingDialog } from "@/components/ai/reg-ai-billing-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type OrganizationAISetupProps = {
  accessToken: string;
  value: OrganizationAIChoice | null;
  onChange: (choice: OrganizationAIChoice | null) => void;
};

type CatalogDefaults = {
  analysis: string;
  redline: string;
  embedding: string;
};

/**
 * Mandatory LLM / Model step before an organization is created.
 * Analysis and redlines are chosen separately so cost and quality can be balanced.
 */
export function OrganizationAISetup({ accessToken, value, onChange }: OrganizationAISetupProps) {
  const [billingOpen, setBillingOpen] = useState(false);
  const [keyItem, setKeyItem] = useState<AIModelItem | null>(null);
  const [defaults, setDefaults] = useState<CatalogDefaults>({
    analysis: "claude-opus-4-6",
    redline: "claude-sonnet-4-6",
    embedding: "text-embedding-3-large",
  });

  const fetchModels = useCallback<FetchModels>(
    (params) => apiFetch<AIModelListResponse>(modelsPath(params), undefined, { token: accessToken }),
    [accessToken]
  );

  const fetchProviders = useCallback<FetchProviders>(
    (params) => apiFetch<AIProviderListResponse>(providersPath(params), undefined, { token: accessToken }),
    [accessToken]
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch<{
      default_analysis?: { model: string };
      default_generation?: { model: string };
      default_embedding?: { model: string };
    }>(
      "/api/v1/ai/catalog",
      undefined,
      { token: accessToken }
    )
      .then((catalog) => {
        if (!cancelled) {
          setDefaults({
            analysis: catalog.default_analysis?.model ?? "stronger Claude model",
            redline: catalog.default_generation?.model ?? "faster Claude model",
            embedding: catalog.default_embedding?.model ?? "text-embedding-3-large",
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function chosenModel(role: "analysis" | "redline"): string {
    if (value?.option !== "own_key") {
      return defaults[role];
    }
    const slot = value[role];
    return slot === "reg_ai_default" ? defaults[role] : slot.item.model;
  }

  function chosenEmbedding(): string {
    if (value?.option === "own_key" && value.embedding && value.embedding !== "reg_ai_default") {
      return value.embedding.item.model;
    }
    return defaults.embedding;
  }

  /** Jobs to print on a model row: the user's choice, and the Reg-AI defaults. */
  function jobWords(item: AIModelItem): Array<
    "reg-ai-default-analysis" | "reg-ai-default-redlines" | "analysis" | "redlines"
  > {
    const words = new Set<"reg-ai-default-analysis" | "reg-ai-default-redlines" | "analysis" | "redlines">();
    const defaultAnalysis = item.default_roles?.includes("analysis") || item.model === defaults.analysis;
    const defaultRedline = item.default_roles?.includes("redline") || item.model === defaults.redline;
    if (defaultAnalysis) {
      words.add("reg-ai-default-analysis");
    }
    if (defaultRedline) {
      words.add("reg-ai-default-redlines");
    }
    if (words.size === 0 && item.is_default && item.kind === "generation") {
      words.add("reg-ai-default-analysis");
      words.add("reg-ai-default-redlines");
    }
    if (value?.option === "own_key") {
      if (
        value.analysis !== "reg_ai_default" &&
        modelKey(value.analysis.item) === modelKey(item) &&
        !words.has("reg-ai-default-analysis")
      ) {
        words.add("analysis");
      }
      if (
        value.redline !== "reg_ai_default" &&
        modelKey(value.redline.item) === modelKey(item) &&
        !words.has("reg-ai-default-redlines")
      ) {
        words.add("redlines");
      }
    }
    return (
      ["reg-ai-default-analysis", "reg-ai-default-redlines", "analysis", "redlines"] as const
    ).filter((word) => words.has(word));
  }

  function providerJobWords(providerId: string): Array<"analysis" | "redlines"> {
    if (value?.option !== "own_key") {
      return [];
    }
    const words = new Set<"analysis" | "redlines">();
    if (value.analysis !== "reg_ai_default" && value.analysis.item.provider === providerId) {
      words.add("analysis");
    }
    if (value.redline !== "reg_ai_default" && value.redline.item.provider === providerId) {
      words.add("redlines");
    }
    return (["analysis", "redlines"] as const).filter((word) => words.has(word));
  }

  function modelIsOn(item: AIModelItem): boolean {
    if (value?.option !== "own_key") {
      return false;
    }
    if (item.kind === "embedding") {
      const slot = value.embedding;
      return Boolean(slot && slot !== "reg_ai_default" && modelKey(slot.item) === modelKey(item));
    }
    return (["analysis", "redline"] as const).some((role) => {
      const slot = value[role];
      return slot !== "reg_ai_default" && modelKey(slot.item) === modelKey(item);
    });
  }

  function clearModel(item: AIModelItem) {
    if (value?.option !== "own_key") {
      return;
    }
    const next = {
      analysis: value.analysis,
      redline: value.redline,
      embedding: value.embedding ?? ("reg_ai_default" as const),
    };
    if (item.kind === "embedding") {
      if (next.embedding !== "reg_ai_default" && modelKey(next.embedding.item) === modelKey(item)) {
        next.embedding = "reg_ai_default";
      }
    } else {
      for (const role of ["analysis", "redline"] as const) {
        const slot = next[role];
        if (slot !== "reg_ai_default" && modelKey(slot.item) === modelKey(item)) {
          next[role] = "reg_ai_default";
        }
      }
    }
    if (
      next.analysis === "reg_ai_default" &&
      next.redline === "reg_ai_default" &&
      next.embedding === "reg_ai_default"
    ) {
      onChange(null);
      return;
    }
    onChange({ option: "own_key", ...next });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4" />
          LLM / Model selection <span className="text-destructive">*</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Required. Pick a model for analysis and a model for redlines, or use the Reg-AI pair. The two
          jobs have different cost and quality tradeoffs.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <JobSlot title="Analysis" model={value ? chosenModel("analysis") : "Not chosen"} body={ANALYSIS_TRADEOFF} />
        <JobSlot title="Redlines" model={value ? chosenModel("redline") : "Not chosen"} body={REDLINE_TRADEOFF} />
      </div>

      {value ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p>Analysis: {chosenModel("analysis")}</p>
            <p>Redlines: {chosenModel("redline")}</p>
            <p>Embeddings: {chosenEmbedding()}</p>
          </div>
        </div>
      ) : null}

      <ModelList
        fetchProviders={fetchProviders}
        fetchModels={fetchModels}
        renderProviderBadges={(provider) => {
          const words = providerJobWords(provider.provider);
          if (words.length === 0) {
            return null;
          }
          return (
            <>
              {words.map((word) => (
                <Badge key={word} className="px-1.5 py-0 text-[10px]">
                  {word}
                </Badge>
              ))}
            </>
          );
        }}
        regAiDefaultSelected={value?.option === "reg_ai_default"}
        onRegAiDefaultToggle={(next) => {
          if (next && value?.option !== "reg_ai_default") {
            setBillingOpen(true);
          } else if (!next && value?.option === "reg_ai_default") {
            onChange(null);
          }
        }}
        regAiDefaultDescription={`Balanced pair, billed by Reg-AI. Analysis uses ${defaults.analysis}. Redlines use ${defaults.redline}. Embeddings use OpenAI.`}
        isModelOn={modelIsOn}
        onOpenModel={setKeyItem}
        onToggleModel={(item, next) => {
          if (next) {
            setKeyItem(item);
          } else {
            clearModel(item);
          }
        }}
        maxHeightClassName="max-h-[320px]"
        renderBadges={(item) => <JobWordBadges words={jobWords(item)} />}
      />

      <RegAIBillingDialog
        open={billingOpen}
        onOpenChange={setBillingOpen}
        onAccept={() => {
          onChange({ option: "reg_ai_default" });
          setBillingOpen(false);
        }}
      />

      {keyItem ? (
        <RegistrationKeyDialog
          accessToken={accessToken}
          item={keyItem}
          value={value}
          onClose={() => setKeyItem(null)}
          onConfirm={(choice) => {
            onChange(choice);
            setKeyItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

function JobSlot({ title, model, body }: { title: string; model: string; body: string }) {
  return (
    <article className="rounded-lg border px-3 py-2 text-sm">
      <p className="font-medium">
        {title} · <span className="font-normal">{model}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </article>
  );
}

function JobWordBadges({
  words,
}: {
  words: Array<"reg-ai-default-analysis" | "reg-ai-default-redlines" | "analysis" | "redlines">;
}) {
  if (words.length === 0) {
    return null;
  }
  return (
    <>
      {words.map((word) => (
        <Badge key={word} variant="outline" className="px-1.5 py-0 text-[10px]">
          {word}
        </Badge>
      ))}
    </>
  );
}

function connectedProviderKey(
  value: OrganizationAIChoice | null,
  provider: string
): OwnModelAssignment | null {
  if (value?.option !== "own_key") {
    return null;
  }
  const slots = [value.analysis, value.redline, value.embedding];
  for (const slot of slots) {
    if (
      slot &&
      slot !== "reg_ai_default" &&
      slot.item.provider === provider &&
      Object.values(slot.fields).some((field) => field.trim())
    ) {
      return slot;
    }
  }
  return null;
}

function RegistrationKeyDialog({
  accessToken,
  item,
  value,
  onClose,
  onConfirm,
}: {
  accessToken: string;
  item: AIModelItem;
  value: OrganizationAIChoice | null;
  onClose: () => void;
  onConfirm: (choice: OrganizationAIChoice) => void;
}) {
  const chat = item.kind === "generation";
  const reused = chat ? null : connectedProviderKey(value, item.provider);
  const [forAnalysis, setForAnalysis] = useState(chat);
  const [forRedline, setForRedline] = useState(chat);
  const [values, setValues] = useState<Record<string, string>>({});
  const [apiBase, setApiBase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function confirm() {
    if (chat && !forAnalysis && !forRedline) {
      setError("Choose analysis, redlines, or both.");
      return;
    }
    const previous = value?.option === "own_key" ? value : null;
    const kept = {
      analysis: previous?.analysis ?? ("reg_ai_default" as const),
      redline: previous?.redline ?? ("reg_ai_default" as const),
      embedding: previous?.embedding ?? ("reg_ai_default" as const),
    };
    let fields = reused?.fields ?? null;
    let endpoint = reused?.apiBase ?? null;
    if (!fields) {
      const payload = buildCredentialPayload(item.credential_fields, values, apiBase);
      if ("error" in payload) {
        setError(payload.error);
        setNotice(null);
        return;
      }
      if (item.requires_api_base && !payload.api_base) {
        setError(`${item.provider_name} needs an endpoint URL.`);
        setNotice(null);
        return;
      }
      fields = payload.fields;
      endpoint = payload.api_base;
    }
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(
        CREDENTIALS_VERIFY_PATH,
        {
          method: "POST",
          body: JSON.stringify(credentialVerifyBody(item, fields, endpoint)),
        },
        { token: accessToken, timeoutMs: 25_000 }
      );
      const assignment: OwnModelAssignment = {
        item,
        fields,
        apiBase: endpoint,
      };
      const choice: OrganizationAIChoice = chat
        ? {
            option: "own_key",
            analysis: forAnalysis ? assignment : kept.analysis,
            redline: forRedline ? assignment : kept.redline,
            embedding: kept.embedding,
          }
        : {
            option: "own_key",
            analysis: kept.analysis,
            redline: kept.redline,
            embedding: assignment,
          };
      onConfirm(choice);
    } catch (caught) {
      setError(keyVerificationError(caught, item.provider_name));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !testing && onClose()}>
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
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Close" disabled={testing}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void confirm();
            }}
          >
            {chat ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Use this model for</legend>
                <RoleCheck
                  checked={forAnalysis}
                  onChange={setForAnalysis}
                  title="Analysis"
                  body={ANALYSIS_TRADEOFF}
                  disabled={testing}
                />
                <RoleCheck
                  checked={forRedline}
                  onChange={setForRedline}
                  title="Redlines"
                  body={REDLINE_TRADEOFF}
                  disabled={testing}
                />
                <p className="text-xs text-muted-foreground">
                  A job you leave unchecked keeps the Reg-AI default for that job, billed by Reg-AI, until
                  you assign a model of your own.
                </p>
              </fieldset>
            ) : (
              <p className="text-sm text-muted-foreground">
                This model is for document search. Saving connects your {item.provider_name} key and uses
                this model for embeddings. Analysis and redlines stay as you chose them.
              </p>
            )}

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="h-4 w-4" />
                  {item.provider_name} key
                </p>
                <span className="text-xs text-muted-foreground">{reused ? "Connected" : "Not connected"}</span>
              </div>
              <div className="mt-4 space-y-3">
                {reused ? (
                  <p className="text-xs text-muted-foreground">
                    This {item.provider_name} key is already entered. Document search will use the same key.
                  </p>
                ) : (
                  <ProviderKeyFields
                    item={item}
                    values={values}
                    onValuesChange={setValues}
                    apiBase={apiBase}
                    onApiBaseChange={setApiBase}
                    disabled={testing}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Before saving, Reg-AI sends one tiny test request to {item.provider_name} with this key.
                  Keys {item.provider_name} rejects are never saved. The same key covers every model from{" "}
                  {item.provider_name}.
                </p>
                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline" size="sm" disabled={testing}>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" size="sm" disabled={testing}>
                    {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    {testing ? "Testing key…" : reused ? "Use this model" : "Save key & use model"}
                  </Button>
                </div>
              </div>
            </div>
            {error ? (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                <p className="font-medium">Key verification failed</p>
                <p className="mt-1">{error}</p>
              </div>
            ) : null}
            {notice ? (
              <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
                <p className="font-medium">Key verified</p>
                <p className="mt-1">{notice}</p>
              </div>
            ) : null}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RoleCheck({
  checked,
  onChange,
  title,
  body,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body: string;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </label>
  );
}
