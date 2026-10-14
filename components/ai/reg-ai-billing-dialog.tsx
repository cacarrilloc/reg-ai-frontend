"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type RegAIBillingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the user ticks the acknowledgement and confirms. */
  onAccept: () => void | Promise<void>;
  isPending?: boolean;
  error?: string | null;
  /** Shown when accepting also re-embeds the organization's documents. */
  reembedNotice?: string | null;
};

/** Cost and future-billing warning shown before the Reg-AI default models are selected. */
export function RegAIBillingDialog({
  open,
  onOpenChange,
  onAccept,
  isPending = false,
  error = null,
  reembedNotice = null,
}: RegAIBillingDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (isPending) {
          return;
        }
        if (!next) {
          setAcknowledged(false);
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-background p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Use Reg-AI default models
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                No provider key needed. Reg-AI runs the AI on its own accounts.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="font-medium">AI usage has a cost, and Reg-AI will bill your organization for it.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Analysis (gap analysis, compliance, business-change review) uses a stronger Claude model.
                  Those calls are less frequent, and a stronger model costs more per call.
                </li>
                <li>
                  Redlines (tracked-change policy drafts) use a faster, cheaper Claude model. Those calls
                  are much more frequent, so the cheaper model keeps the bill down.
                </li>
                <li>Document search (embeddings) runs on OpenAI.</li>
                <li>
                  Reg-AI records every AI request your organization makes on these models so it can be
                  billed.
                </li>
                <li>
                  Payment setup is coming soon. No credit card is needed today, but recorded usage may be
                  billed once billing starts.
                </li>
                <li>
                  To be billed by your own provider instead, turn on any model in the list and enter
                  that provider&apos;s key. You can switch at any time.
                </li>
              </ul>
            </div>

            {reembedNotice ? (
              <div className="rounded-lg border p-4">
                <p className="font-medium">Your documents will be re-embedded</p>
                <p className="mt-1 text-muted-foreground">{reembedNotice}</p>
              </div>
            ) : null}

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={isPending}
              />
              <span>
                I understand that Reg-AI will bill my organization for AI usage on the Reg-AI default
                models.
              </span>
            </label>

            {error ? <p className="text-destructive">{error}</p> : null}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="button" disabled={!acknowledged || isPending} onClick={() => void onAccept()}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {reembedNotice ? "Re-embed & use Reg-AI default models" : "Use Reg-AI default models"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
