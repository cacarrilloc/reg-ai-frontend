"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mails, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { fetchCurrentMembership } from "@/lib/member-capabilities";
import { canManageOrgNewsletterSubscribers } from "@/lib/system-permissions";
import { useBackendAuth } from "@/lib/use-backend-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  tableCellClassName,
  tableFrameClassName,
  tableFrameRowClassName,
  tableFrameTableClassName,
  tableHeadClassName,
} from "@/lib/table-styles";

type NewsletterSubscriber = {
  id: string;
  email: string;
  source: string;
  invited_by: string | null;
  subscribed_at: string | null;
};

type NewsletterSubscriberListResponse = {
  subscribers: NewsletterSubscriber[];
  total: number;
};

function formatSubscribedAt(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSource(source: string): string {
  const normalized = (source || "").trim().toLowerCase();
  if (normalized === "invite") {
    return "Invite";
  }
  if (normalized === "public") {
    return "Public";
  }
  return source || "—";
}

/**
 * Private per-organization newsletter list. Visible to Master and CCO only.
 */
export function OrganizationNewsletterSubscribersCard() {
  const { authState, getAuthToken, orgId, orgName } = useBackendAuth();
  const [visible, setVisible] = useState(false);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadSubscribers = useCallback(async () => {
    if (authState !== "ready" || !orgId) {
      setVisible(false);
      setSubscribers([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const me = await fetchCurrentMembership({ token, orgId, orgName });
      const allowed = canManageOrgNewsletterSubscribers({
        role: me.role,
        canManage: me.can_manage_newsletter_subscribers,
      });
      if (!allowed) {
        setVisible(false);
        setSubscribers([]);
        return;
      }
      setVisible(true);
      const response = await apiFetch<NewsletterSubscriberListResponse>(
        "/api/v1/newsletter/subscribers",
        undefined,
        { token, orgId, orgName }
      );
      setSubscribers(response.subscribers ?? []);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to load newsletter subscribers.";
      if (/403|Insufficient|Only Master and CCO/i.test(message)) {
        setVisible(false);
        setSubscribers([]);
        return;
      }
      setVisible(true);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [authState, getAuthToken, orgId, orgName]);

  useEffect(() => {
    void loadSubscribers();
  }, [loadSubscribers]);

  async function handleDelete(subscriber: NewsletterSubscriber) {
    if (!window.confirm(`Remove ${subscriber.email} from this organization's newsletter?`)) {
      return;
    }
    setPendingId(subscriber.id);
    setError(null);
    try {
      const token = await getAuthToken();
      await apiFetch(
        `/api/v1/newsletter/subscribers/${encodeURIComponent(subscriber.id)}`,
        { method: "DELETE" },
        { token, orgId, orgName }
      );
      setSubscribers((current) => current.filter((item) => item.id !== subscriber.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove that subscriber.");
    } finally {
      setPendingId(null);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <Card id="newsletter-subscribers">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mails className="h-5 w-5" />
          Reg-AI Newsletter Subscribers
        </CardTitle>
        <CardDescription>
          People on this organization&apos;s private newsletter list. Removing an address stops
          weekly briefs for this organization only. Master and CCO users can manage this list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading subscribers…
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!isLoading && !error && subscribers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No newsletter subscribers for this organization yet.
          </p>
        ) : null}
        {!isLoading && subscribers.length > 0 ? (
          <div className={tableFrameClassName}>
            <table className={`w-full min-w-[520px] text-sm ${tableFrameTableClassName}`}>
              <thead className={tableHeadClassName}>
                <tr>
                  <th>Email</th>
                  <th>Source</th>
                  <th>Subscribed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((subscriber) => (
                  <tr key={subscriber.id} className={tableFrameRowClassName}>
                    <td className={`${tableCellClassName} px-3 py-3 font-medium`}>
                      {subscriber.email}
                    </td>
                    <td className={`${tableCellClassName} px-3 py-3`}>
                      {formatSource(subscriber.source)}
                    </td>
                    <td className={`${tableCellClassName} px-3 py-3 text-muted-foreground`}>
                      {formatSubscribedAt(subscriber.subscribed_at)}
                    </td>
                    <td className={`${tableCellClassName} px-3 py-3`}>
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          disabled={pendingId === subscriber.id}
                          onClick={() => void handleDelete(subscriber)}
                        >
                          {pendingId === subscriber.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
