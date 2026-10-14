import { describe, expect, it } from "vitest";
import {
  activeRoles,
  buildCredentialPayload,
  canManageAIModels,
  CREDENTIALS_VERIFY_PATH,
  credentialVerifyBody,
  chunkCount,
  defaultModelsNeedReembed,
  friendlyApiError,
  isModelEnabled,
  keyVerificationError,
  missingCredentialMessage,
  modelsPath,
  needsReembed,
  organizationAISetupBody,
  organizationAISetupCompleteBody,
  providerModelCount,
  providersPath,
  reembedActive,
  reembedMessage,
  reembedPercent,
  selectionUpdate,
  type AIModelItem,
  type AISettings,
} from "@/lib/ai-models";
import { ORGANIZATIONS_CURRENT_AI_SETUP_PATH } from "@/lib/organizations";

const gpt4o: AIModelItem = {
  provider: "openai",
  provider_name: "OpenAI",
  model: "gpt-4o",
  kind: "generation",
  capabilities: ["vision"],
  dimensions: null,
  is_default: false,
  requires_api_base: false,
  credential_fields: ["api_key"],
};

const smallEmbedding: AIModelItem = {
  ...gpt4o,
  model: "text-embedding-3-small",
  kind: "embedding",
  capabilities: [],
  dimensions: 1536,
};

function settings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    mode: "platform",
    mode_label: "Use Reg-AI default models",
    billed_to: "reg_ai",
    generation: { provider: "anthropic", model: "claude-sonnet-4-6" },
    analysis: { provider: "anthropic", model: "claude-opus-4-6" },
    embedding: { provider: "openai", model: "text-embedding-3-large", dimensions: 3072 },
    configured: false,
    credentials: [
      {
        provider: "openai",
        provider_name: "OpenAI",
        key_hint: "sk-…5678",
        api_base: null,
        enabled_models: ["gpt-4o", "gpt-5"],
        updated_at: null,
      },
    ],
    ...overrides,
  };
}

describe("ai-models", () => {
  it("shares one provider key across that provider's models", () => {
    const current = settings();
    expect(isModelEnabled(current, gpt4o)).toBe(true);
    expect(isModelEnabled(current, { ...gpt4o, model: "gpt-5" })).toBe(true);
    expect(isModelEnabled(current, { ...gpt4o, model: "o3" })).toBe(false);
    expect(isModelEnabled(current, { ...gpt4o, provider: "mistral", model: "gpt-4o" })).toBe(false);
  });

  it("requires every credential field unless a keyless endpoint is given", () => {
    expect(buildCredentialPayload(["api_key"], { api_key: "  sk-1  " }, "")).toEqual({
      fields: { api_key: "sk-1" },
      api_base: null,
    });
    expect(buildCredentialPayload(["api_key"], {}, "")).toEqual({ error: "Enter API key." });
    expect(buildCredentialPayload(["api_key"], {}, "https://llm.example.com")).toEqual({
      fields: {},
      api_base: "https://llm.example.com",
    });
    expect(
      buildCredentialPayload(
        ["aws_access_key_id", "aws_region_name", "aws_secret_access_key"],
        { aws_access_key_id: "AKIA" },
        "https://bedrock.example.com"
      )
    ).toEqual({ error: "Enter AWS region, AWS secret access key." });
  });

  it("switches one job and keeps the others", () => {
    const byok = settings({
      mode: "byok",
      configured: true,
      generation: { provider: "openai", model: "gpt-5" },
      analysis: { provider: "anthropic", model: "claude-opus-4-6" },
    });
    expect(selectionUpdate(byok, gpt4o, "redline")).toEqual({
      mode: "byok",
      generation: { provider: "openai", model: "gpt-4o", dimensions: null },
      analysis: byok.analysis,
      embedding: byok.embedding,
    });
    expect(selectionUpdate(byok, gpt4o, "analysis")).toEqual({
      mode: "byok",
      analysis: { provider: "openai", model: "gpt-4o", dimensions: null },
      generation: byok.generation,
      embedding: byok.embedding,
    });
    expect(selectionUpdate(byok, smallEmbedding)).toEqual({
      mode: "byok",
      embedding: { provider: "openai", model: "text-embedding-3-small", dimensions: 1536 },
      generation: byok.generation,
      analysis: byok.analysis,
    });
    expect(selectionUpdate(settings(), smallEmbedding)).toEqual({
      mode: "byok",
      embedding: { provider: "openai", model: "text-embedding-3-small", dimensions: 1536 },
      generation: settings().generation,
      analysis: settings().analysis,
    });
  });

  it("reports which job runs on a model", () => {
    const byok = settings({ mode: "byok", generation: { provider: "openai", model: "gpt-4o" } });
    expect(activeRoles(byok, gpt4o)).toEqual(["redline"]);
    expect(activeRoles(byok, smallEmbedding)).toEqual([]);
    const both = settings({
      mode: "byok",
      generation: { provider: "openai", model: "gpt-4o" },
      analysis: { provider: "openai", model: "gpt-4o" },
    });
    expect(activeRoles(both, gpt4o)).toEqual(["analysis", "redline"]);
  });

  it("limits management to Master and CCO", () => {
    expect(canManageAIModels("org:master_user")).toBe(true);
    expect(canManageAIModels("chief_compliance_officer")).toBe(true);
    expect(canManageAIModels("product_manager")).toBe(false);
    expect(canManageAIModels(null)).toBe(false);
  });

  it("builds the mandatory organization AI setup body", () => {
    expect(organizationAISetupBody({ option: "reg_ai_default" })).toEqual({
      option: "reg_ai_default",
      accept_reg_ai_billing: true,
    });
    expect(
      organizationAISetupBody({
        option: "own_key",
        analysis: "reg_ai_default",
        redline: {
          item: gpt4o,
          fields: { api_key: "sk-1234567890" },
          apiBase: null,
        },
      })
    ).toEqual({
      option: "own_key",
      workflows: [
        {
          role: "redline",
          provider: "openai",
          model: "gpt-4o",
          fields: { api_key: "sk-1234567890" },
          api_base: null,
        },
      ],
    });
    expect(
      organizationAISetupBody({
        option: "own_key",
        analysis: "reg_ai_default",
        redline: "reg_ai_default",
        embedding: {
          item: smallEmbedding,
          fields: { api_key: "sk-1234567890" },
          apiBase: null,
        },
      })
    ).toEqual({
      option: "own_key",
      workflows: [
        {
          role: "embedding",
          provider: "openai",
          model: "text-embedding-3-small",
          fields: { api_key: "sk-1234567890" },
          api_base: null,
          dimensions: 1536,
        },
      ],
    });
  });

  it("finishes organization AI setup without sending the key a second time", () => {
    expect(
      organizationAISetupCompleteBody({
        option: "own_key",
        analysis: {
          item: gpt4o,
          fields: { api_key: "sk-1234567890" },
          apiBase: null,
        },
        redline: "reg_ai_default",
      })
    ).toEqual({
      option: "own_key",
      workflows: [
        {
          role: "analysis",
          provider: "openai",
          model: "gpt-4o",
          api_base: null,
        },
      ],
    });
  });

  it("finishes the registration key on the org after the workspace is isolated", () => {
    expect(ORGANIZATIONS_CURRENT_AI_SETUP_PATH).toBe("/api/v1/organizations/current/ai-setup");
  });

  it("builds the registration dialog verify body without storing the key", () => {
    expect(CREDENTIALS_VERIFY_PATH).toBe("/api/v1/ai/credentials/verify");
    expect(credentialVerifyBody(gpt4o, { api_key: "sk-made-up" }, null)).toEqual({
      provider: "openai",
      model: "gpt-4o",
      kind: "generation",
      fields: { api_key: "sk-made-up" },
      api_base: null,
    });
  });

  it("explains which workflows are missing a key", () => {
    expect(
      missingCredentialMessage([{ provider: "openai", provider_name: "OpenAI", purpose: "embedding" }])
    ).toBe(
      "Embeddings (document search) need your OpenAI key. Add the key below, or switch to Reg-AI default models."
    );
    expect(missingCredentialMessage([])).toBeNull();
  });

  it("builds model search paths", () => {
    expect(modelsPath({ query: " gpt ", kind: "embedding", offset: 50, limit: 50 })).toBe(
      "/api/v1/ai/models?offset=50&limit=50&q=gpt&kind=embedding"
    );
    expect(modelsPath({ query: "", kind: "all", offset: 0, limit: 50, provider: "xai" })).toBe(
      "/api/v1/ai/models?offset=0&limit=50&provider=xai"
    );
    expect(providersPath({ query: "grok", kind: "generation" })).toBe(
      "/api/v1/ai/providers?q=grok&kind=generation"
    );
    expect(providersPath({ query: " ", kind: "all" })).toBe("/api/v1/ai/providers");
  });

  it("summarizes a provider's models", () => {
    const summary = {
      provider: "openai",
      provider_name: "OpenAI",
      requires_api_base: false,
      credential_fields: ["api_key"],
      generation_models: 96,
      embedding_models: 3,
    };
    expect(providerModelCount(summary)).toBe("96 chat · 3 embedding models");
    expect(providerModelCount({ ...summary, generation_models: 0, embedding_models: 1 })).toBe(
      "1 embedding model"
    );
  });

  it("strips the transport prefix from API errors", () => {
    expect(friendlyApiError(new Error("API request failed: Add your OpenAI key first."), "x")).toBe(
      "Add your OpenAI key first."
    );
    expect(friendlyApiError("nope", "Fallback")).toBe("Fallback");
  });

  it("explains a failed key check without HTTP jargon", () => {
    expect(keyVerificationError(new Error("API request failed: Method Not Allowed"), "Oracle Cloud (OCI)")).toBe(
      "Could not verify this Oracle Cloud (OCI) key right now. Try again in a moment."
    );
    expect(keyVerificationError(new Error("API request failed: 401 Unauthorized"), "Amazon Nova")).toBe(
      "The key you entered was not authorized. Make sure it is the correct Amazon Nova key and try again."
    );
    expect(
      keyVerificationError(
        new Error("Anthropic rejected this API key: it is invalid or wrong. The key was not saved."),
        "Anthropic"
      )
    ).toBe("The key you entered was not authorized. Make sure it is the correct Anthropic key and try again.");
    expect(
      keyVerificationError(
        new Error("OpenAI refused a test request with this key because of billing or quota. The key was not saved."),
        "OpenAI"
      )
    ).toBe("OpenAI refused a test request with this key because of billing or quota. The key was not saved.");
  });

  it("locks the embedding model only once documents are embedded", () => {
    expect(needsReembed(settings(), smallEmbedding)).toBe(false);
    const locked = settings({ embedded_chunks: 73, embedding_locked: true });
    expect(needsReembed(locked, smallEmbedding)).toBe(true);
    expect(needsReembed(locked, { ...smallEmbedding, model: "text-embedding-3-large" })).toBe(false);
    expect(needsReembed(locked, gpt4o)).toBe(false);
  });

  it("re-embeds for Reg-AI defaults only when the embedding differs", () => {
    const defaults = { provider: "openai", model: "text-embedding-3-large", dimensions: 3072 };
    const onSmall = settings({
      mode: "byok",
      embedding: { provider: "openai", model: "text-embedding-3-small", dimensions: 1536 },
      embedding_locked: true,
      default_embedding: defaults,
    });
    expect(defaultModelsNeedReembed(onSmall)).toBe(true);
    expect(defaultModelsNeedReembed({ ...onSmall, embedding_locked: false })).toBe(false);
    expect(defaultModelsNeedReembed({ ...onSmall, embedding: { ...defaults, api_base: null } })).toBe(false);
  });

  it("describes re-embedding progress and outcome", () => {
    const job = {
      status: "running" as const,
      embedding: { provider: "openai", model: "text-embedding-3-small" },
      total_chunks: 73,
      embedded_chunks: 20,
      error: null,
      started_at: "2026-09-26T00:00:00Z",
      finished_at: null,
    };
    const running = settings({ reembed: job });
    expect(reembedActive(running)).toBe(true);
    expect(reembedPercent(job)).toBe(27);
    expect(reembedMessage(running)).toBe(
      "Re-embedding 20 of 73 document chunks with text-embedding-3-small. Document search keeps using text-embedding-3-large until this finishes."
    );
    const failed = settings({ reembed: { ...job, status: "failed", error: "Invalid key." } });
    expect(reembedActive(failed)).toBe(false);
    expect(reembedMessage(failed)).toBe(
      "Switching embeddings to text-embedding-3-small failed: Invalid key. Document search still uses text-embedding-3-large."
    );
    expect(reembedMessage(settings())).toBeNull();
    expect(chunkCount(1)).toBe("1 document chunk");
  });
});
