"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import {
  friendlyApiError,
  modelKey,
  providerModelCount,
  type AIModelItem,
  type AIProviderSummary,
  type FetchModels,
  type FetchProviders,
  type ModelKind,
} from "@/lib/ai-models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const PAGE_SIZE = 50;

const KIND_FILTERS: { id: ModelKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "generation", label: "Chat" },
  { id: "embedding", label: "Embedding" },
];

export function kindLabel(item: AIModelItem): string {
  if (item.kind === "embedding") {
    return item.dimensions ? `Embedding · ${item.dimensions} dims` : "Embedding";
  }
  return item.capabilities.includes("vision") ? "Chat · vision" : "Chat";
}

type ModelRowProps = {
  isModelOn: (item: AIModelItem) => boolean;
  onOpenModel: (item: AIModelItem) => void;
  onToggleModel: (item: AIModelItem, next: boolean) => void;
  pendingModelKey?: string | null;
  renderBadges?: (item: AIModelItem) => ReactNode;
};

type ModelListProps = ModelRowProps & {
  fetchProviders: FetchProviders;
  fetchModels: FetchModels;
  /** "Reg-AI default models" row pinned above the providers. */
  regAiDefaultSelected: boolean;
  onRegAiDefaultToggle: (next: boolean) => void;
  regAiDefaultPending?: boolean;
  regAiDefaultDescription: string;
  /** Status shown on a provider's row, e.g. its key or the workflows it runs. */
  renderProviderBadges?: (provider: AIProviderSummary) => ReactNode;
  /** Extra work for the refresh button, e.g. reloading org settings. */
  onRefresh?: () => Promise<void>;
  maxHeightClassName?: string;
};

/** One collapsible row per provider company, alphabetical, with the Reg-AI default option first. */
export function ModelList({
  fetchProviders,
  fetchModels,
  regAiDefaultSelected,
  onRegAiDefaultToggle,
  regAiDefaultPending = false,
  regAiDefaultDescription,
  renderProviderBadges,
  onRefresh,
  maxHeightClassName = "max-h-[640px]",
  ...rowProps
}: ModelListProps) {
  const [providers, setProviders] = useState<AIProviderSummary[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [kind, setKind] = useState<ModelKind | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const page = await fetchProviders({ query: debouncedQuery, kind });
      if (id === requestId.current) {
        setProviders(page.items);
      }
    } catch (caught) {
      if (id === requestId.current) {
        setError(friendlyApiError(caught, "Unable to load providers."));
      }
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
      }
    }
  }, [debouncedQuery, fetchProviders, kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function refresh() {
    setReloadKey((key) => key + 1);
    try {
      await Promise.all([onRefresh?.(), reload()]);
    } catch (caught) {
      setError(friendlyApiError(caught, "Unable to refresh."));
    }
  }

  const modelTotal = providers.reduce((sum, p) => sum + p.generation_models + p.embedding_models, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // The list can sit inside another form (organization registration).
              if (event.key === "Enter") {
                event.preventDefault();
              }
            }}
            placeholder="Search providers or models"
            aria-label="Search providers or models"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0"
          aria-label="Refresh providers"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex items-center gap-1 text-xs">
        {KIND_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setKind(filter.id)}
            className={`rounded-md px-2 py-1 transition-colors ${
              kind === filter.id
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">
          {providers.length.toLocaleString()} provider{providers.length === 1 ? "" : "s"} ·{" "}
          {modelTotal.toLocaleString()} model{modelTotal === 1 ? "" : "s"}
        </span>
      </div>

      <article className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onRegAiDefaultToggle(true)}>
          <span className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Reg-AI default models
            {regAiDefaultSelected ? (
              <>
                <Badge className="px-1.5 py-0 text-[10px]">reg-ai-default-analysis</Badge>
                <Badge className="px-1.5 py-0 text-[10px]">reg-ai-default-redlines</Badge>
              </>
            ) : null}
          </span>
          <span className="block text-xs text-muted-foreground">{regAiDefaultDescription}</span>
        </button>
        {regAiDefaultPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        <Switch
          checked={regAiDefaultSelected}
          disabled={regAiDefaultPending}
          aria-label="Use Reg-AI default models"
          onCheckedChange={onRegAiDefaultToggle}
        />
      </article>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className={`${maxHeightClassName} space-y-3 overflow-y-auto`} aria-busy={isLoading}>
        {isLoading && providers.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading providers…
          </div>
        ) : null}
        {!isLoading && providers.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground">
            No providers or models match &ldquo;{debouncedQuery}&rdquo;.
          </p>
        ) : null}
        {providers.map((provider) => (
          <ProviderRow
            key={provider.provider}
            provider={provider}
            isExpanded={expanded === provider.provider}
            onToggle={() => setExpanded((current) => (current === provider.provider ? null : provider.provider))}
            query={debouncedQuery}
            kind={kind}
            reloadKey={reloadKey}
            fetchModels={fetchModels}
            badges={renderProviderBadges?.(provider)}
            {...rowProps}
          />
        ))}
      </div>
    </div>
  );
}

type ProviderRowProps = ModelRowProps & {
  provider: AIProviderSummary;
  isExpanded: boolean;
  onToggle: () => void;
  query: string;
  kind: ModelKind | "all";
  reloadKey: number;
  fetchModels: FetchModels;
  badges?: ReactNode;
};

function ProviderRow({ provider, isExpanded, onToggle, badges, ...modelsProps }: ProviderRowProps) {
  const panelId = `ai-provider-${provider.provider}`;
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={panelId}
          >
            Details
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <button type="button" className="min-w-0 text-left" onClick={onToggle}>
            <span className="block truncate font-medium">{provider.provider_name}</span>
            <span className="block text-xs text-muted-foreground">{providerModelCount(provider)}</span>
          </button>
        </div>
        {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
      </div>
      {isExpanded ? (
        <div id={panelId}>
          <ProviderModels provider={provider} {...modelsProps} />
        </div>
      ) : null}
    </article>
  );
}

type ProviderModelsProps = ModelRowProps & {
  provider: AIProviderSummary;
  query: string;
  kind: ModelKind | "all";
  reloadKey: number;
  fetchModels: FetchModels;
};

function ProviderModels({
  provider,
  query,
  kind,
  reloadKey,
  fetchModels,
  isModelOn,
  onOpenModel,
  onToggleModel,
  pendingModelKey = null,
  renderBadges,
}: ProviderModelsProps) {
  const [models, setModels] = useState<AIModelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchModels({ query, kind, offset: 0, limit: PAGE_SIZE, provider: provider.provider })
      .then((page) => {
        if (!cancelled) {
          setModels(page.items);
          setTotal(page.total);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(friendlyApiError(caught, `Unable to load ${provider.provider_name} models.`));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchModels, kind, provider.provider, provider.provider_name, query, reloadKey]);

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const page = await fetchModels({
        query,
        kind,
        offset: models.length,
        limit: PAGE_SIZE,
        provider: provider.provider,
      });
      setModels((current) => [...current, ...page.items]);
      setTotal(page.total);
    } catch (caught) {
      setError(friendlyApiError(caught, "Unable to load more models."));
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-md border">
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <ul className="max-h-[360px] divide-y overflow-y-auto" aria-busy={isLoading}>
        {isLoading && models.length === 0 ? (
          <li className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading {provider.provider_name} models…
          </li>
        ) : null}
        {models.map((item) => {
          const key = modelKey(item);
          const on = isModelOn(item);
          return (
            <li key={key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenModel(item)}>
                <span className="block truncate text-sm font-medium">{item.model}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{kindLabel(item)}</span>
                  {renderBadges?.(item)}
                </span>
              </button>
              {pendingModelKey === key ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}
              <Switch
                checked={on}
                disabled={pendingModelKey === key}
                aria-label={`${on ? "Turn off" : "Turn on"} ${item.model}`}
                onCheckedChange={(next) => onToggleModel(item, next)}
              />
            </li>
          );
        })}
      </ul>
      {models.length < total ? (
        <div className="border-t p-2 text-center">
          <Button type="button" variant="ghost" size="sm" disabled={isLoadingMore} onClick={() => void loadMore()}>
            {isLoadingMore ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Show more ({(total - models.length).toLocaleString()} left)
          </Button>
        </div>
      ) : null}
    </div>
  );
}
