"use client";

import { useState } from "react";
import { LifeBuoy, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const priorities = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" }
];

export type SupportTicketFormProps = {
  authState?: "loading" | "signed-out" | "ready";
  getAuthToken?: () => Promise<string | null>;
  orgId?: string | null;
  onSubmitted?: () => void;
};

export function SupportTicketForm({ authState = "ready", getAuthToken, orgId, onSubmitted }: SupportTicketFormProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState(priorities[1].value);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authState !== "ready") {
      setError("Sign in to submit a support ticket.");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setError("Add a subject and a description of the issue.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getAuthToken ? await getAuthToken() : null;
      await apiFetch(
        "/api/v1/support/tickets",
        { method: "POST", body: JSON.stringify({ subject: subject.trim(), message: message.trim(), priority }) },
        { token, orgId }
      );
      setSuccess("Your ticket was submitted. Our team will follow up by email.");
      setSubject("");
      setMessage("");
      setPriority(priorities[1].value);
      onSubmitted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit the support ticket.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5" />
          Contact support
        </CardTitle>
        <CardDescription>Open a ticket and our team will respond by email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-2">
              <Label htmlFor="support-subject">Subject</Label>
              <Input
                id="support-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Redline generation is stuck"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="support-priority">Priority</Label>
              <select
                id="support-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {priorities.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="support-message">Describe the issue</Label>
            <Textarea
              id="support-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What happened, and what did you expect?"
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p> : null}
          <Button type="submit" disabled={isSubmitting || authState !== "ready"} className="w-fit gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
            Submit ticket
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
