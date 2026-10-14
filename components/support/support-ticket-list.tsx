"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SupportTicket = {
  id: string;
  subject: string;
  description?: string;
  message?: string;
  body?: string;
  sender?: string;
  priority: string;
  status: "open" | "closed" | "escalated" | string;
  created_at: string;
};

type SupportTicketListApi = {
  items: SupportTicket[];
  total: number;
};

export type SupportTicketListProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  refreshKey?: number;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function ticketDescription(ticket: SupportTicket) {
  return ticket.description || ticket.message || ticket.body || "";
}

function statusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "closed" || normalized === "close") return "Closed";
  if (normalized === "escalated") return "Escalated";
  return "Open";
}

export function SupportTicketList({ authState = "ready", getAuthToken, orgId, refreshKey }: SupportTicketListProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    if (authState !== "ready") {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      const response = await apiFetch<SupportTicketListApi>(
        "/api/v1/support/tickets?limit=25",
        undefined,
        { token, orgId }
      );
      setTickets(Array.isArray(response.items) ? response.items : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load support tickets.");
    } finally {
      setIsLoading(false);
    }
  }, [authState, getAuthToken, orgId]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets, refreshKey]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Your tickets</CardTitle>
          <CardDescription>Track the status of support requests for this organization.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadTickets()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!error && isLoading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading tickets
          </div>
        ) : null}
        {!error && !isLoading && tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No support tickets yet.</p>
        ) : null}
        {!error && !isLoading && tickets.length > 0 ? (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const status = statusLabel(ticket.status);
              return (
                <article key={ticket.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{ticket.subject}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{ticket.priority.toLowerCase()}</Badge>
                      <Badge
                        variant="outline"
                        className={
                          status === "Closed"
                            ? "border-transparent bg-foreground text-background"
                            : status === "Escalated"
                              ? "border-destructive/40 text-destructive"
                              : undefined
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{ticket.id}</p>
                  {ticket.sender ? (
                    <p className="mt-1 text-xs text-muted-foreground">From {ticket.sender}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-muted-foreground">{ticketDescription(ticket)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(ticket.created_at)}</p>
                </article>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
