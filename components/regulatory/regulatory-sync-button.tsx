"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type RegulatorySyncResponse = {
  status: string;
  message: string;
};

type RegulatorySyncButtonProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  onSyncStarted?: () => void;
  variant?: "default" | "outline";
  size?: "default" | "sm";
};

const SYNC_POLL_MS = [8_000, 20_000, 40_000, 70_000, 110_000] as const;

export function RegulatorySyncButton({
  authState = "ready",
  getAuthToken,
  orgId,
  onSyncStarted,
  variant = "default",
  size = "sm",
}: RegulatorySyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timer of pollTimersRef.current) {
        window.clearTimeout(timer);
      }
      pollTimersRef.current = [];
    };
  }, []);

  async function handleSync() {
    if (authState !== "ready") {
      setError("Sign in to sync regulatory sources.");
      return;
    }

    for (const timer of pollTimersRef.current) {
      window.clearTimeout(timer);
    }
    pollTimersRef.current = [];

    setIsSyncing(true);
    setError(null);
    setNotice("Starting regulatory sync…");

    try {
      const token = getAuthToken ? await getAuthToken() : null;
      if (getAuthToken && !token) {
        throw new Error("Sign in to sync regulatory sources.");
      }
      const response = await apiFetch<RegulatorySyncResponse>(
        "/api/v1/regulatory/sync",
        { method: "POST" },
        { token, orgId, timeoutMs: 30_000 }
      );
      if (response.status === "skipped") {
        setIsSyncing(false);
        setNotice(null);
        setError(response.message || "Regulatory sync did not run.");
        return;
      }
      setNotice(
        response.message ||
          "Sync started. Scraping SEC newsroom, FINRA media center, and CFTC Press Room — the feed will refresh automatically."
      );
      onSyncStarted?.();
      for (const delay of SYNC_POLL_MS) {
        const timer = window.setTimeout(() => {
          onSyncStarted?.();
          if (delay === SYNC_POLL_MS[SYNC_POLL_MS.length - 1]) {
            setIsSyncing(false);
            setNotice(
              "Sync finished running in the background. Use Refresh if new notices are not visible yet."
            );
          }
        }, delay);
        pollTimersRef.current.push(timer);
      }
    } catch (caught) {
      setIsSyncing(false);
      setNotice(null);
      setError(caught instanceof Error ? caught.message : "Unable to start regulatory sync.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant={variant}
        size={size}
        onClick={() => void handleSync()}
        disabled={isSyncing || authState !== "ready"}
        className="gap-2"
        aria-busy={isSyncing}
      >
        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        {isSyncing ? "Syncing…" : "Sync now"}
      </Button>
      {notice ? (
        <p className="max-w-sm text-right text-xs text-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="max-w-sm text-right text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
