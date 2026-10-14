"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isPostHogConfigured, isSentryConfigured } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BackendHealth = {
  status: string;
  sentry_configured: boolean;
  langfuse_configured: boolean;
  resend_configured: boolean;
};

type IntegrationRow = {
  name: string;
  description: string;
  configured: boolean | null;
  source: "frontend" | "backend";
};

export function IntegrationsStatusCard() {
  const [backend, setBackend] = useState<BackendHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      setIsLoading(true);
      setError(null);
      try {
        // Public health endpoint — no auth required.
        const response = await apiFetch<BackendHealth>("/api/v1/health");
        if (!cancelled) {
          setBackend(response);
        }
      } catch (caught) {
        if (!cancelled) {
          setBackend(null);
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to reach the backend health endpoint."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  const integrations: IntegrationRow[] = [
    {
      name: "PostHog",
      description: "Product analytics (frontend env)",
      configured: isPostHogConfigured(),
      source: "frontend",
    },
    {
      name: "Sentry (frontend)",
      description: "Browser error monitoring (NEXT_PUBLIC_SENTRY_DSN)",
      configured: isSentryConfigured(),
      source: "frontend",
    },
    {
      name: "Sentry (API)",
      description: "FastAPI error and performance monitoring",
      configured: backend ? backend.sentry_configured : null,
      source: "backend",
    },
    {
      name: "Langfuse",
      description: "LLM trace logging for gap analysis and redlines",
      configured: backend ? backend.langfuse_configured : null,
      source: "backend",
    },
    {
      name: "Resend",
      description: "Review workflow email notifications",
      configured: backend ? backend.resend_configured : null,
      source: "backend",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Observability Integrations</CardTitle>
        <CardDescription>
          Frontend status comes from Vercel env vars. API Sentry, Langfuse, and Resend status come
          from the backend health endpoint.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking backend health…
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive">
            Backend health unavailable: {error}. Frontend rows still reflect local env vars.
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="flex items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{integration.name}</p>
                <p className="text-xs text-muted-foreground">{integration.description}</p>
              </div>
              <StatusBadge
                configured={integration.configured}
                source={integration.source}
                backendUnavailable={Boolean(error) && integration.source === "backend"}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  configured,
  source,
  backendUnavailable,
}: {
  configured: boolean | null;
  source: "frontend" | "backend";
  backendUnavailable: boolean;
}) {
  if (backendUnavailable || configured === null) {
    return <Badge variant="outline">{source === "backend" ? "Unknown" : "Pending"}</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className={configured ? "border-transparent bg-foreground text-background" : undefined}
    >
      {configured ? "Configured" : "Pending"}
    </Badge>
  );
}
