"use client";

import { ShieldCheck } from "lucide-react";
import {
  credentialFieldLabel,
  isMultilineField,
  isSecretField,
  type AIModelItem,
} from "@/lib/ai-models";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProviderKeyFieldsProps = {
  item: AIModelItem;
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  apiBase: string;
  onApiBaseChange: (value: string) => void;
  disabled?: boolean;
};

/** Key inputs for one provider: API key, or cloud credentials, plus an endpoint when required. */
export function ProviderKeyFields({
  item,
  values,
  onValuesChange,
  apiBase,
  onApiBaseChange,
  disabled = false,
}: ProviderKeyFieldsProps) {
  return (
    <div className="space-y-3">
      {item.credential_fields.map((field) => {
        const id = `ai-field-${field}`;
        const update = (value: string) => onValuesChange({ ...values, [field]: value });
        return (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={id}>{credentialFieldLabel(field)}</Label>
            {isMultilineField(field) ? (
              <Textarea
                id={id}
                value={values[field] ?? ""}
                onChange={(event) => update(event.target.value)}
                className="font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
              />
            ) : (
              <Input
                id={id}
                type={isSecretField(field) ? "password" : "text"}
                value={values[field] ?? ""}
                onChange={(event) => update(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
              />
            )}
          </div>
        );
      })}
      {item.requires_api_base ? (
        <div className="space-y-1.5">
          <Label htmlFor="ai-field-api-base">Endpoint URL</Label>
          <Input
            id="ai-field-api-base"
            type="url"
            value={apiBase}
            onChange={(event) => onApiBaseChange(event.target.value)}
            placeholder="https://llm.your-company.com/v1"
            autoComplete="off"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">Self-hosted endpoints may leave the API key empty.</p>
        </div>
      ) : null}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        One key covers every {item.provider_name} model. It is encrypted with AES-256 and stored only in
        your organization&apos;s private schema. Reg-AI never shows it again.
      </p>
    </div>
  );
}
