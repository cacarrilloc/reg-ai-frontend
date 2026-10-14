"use client";

import { useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import {
  FacebookBrandIcon,
  LinkedInBrandIcon,
  XBrandIcon,
} from "@/components/share/brand-icons";
import {
  PRODUCT_SHARE_URL,
  productShareMessage,
  productShareText,
} from "@/lib/product-share";
import {
  facebookShareUrl,
  gmailComposeUrl,
  linkedInComposeUrl,
  xShareUrl,
} from "@/lib/publication-share";
import { cn, successTextClassName } from "@/lib/utils";

const SHARE_MESSAGE = productShareMessage();
const SHARE_TEXT = productShareText();
const EMAIL_SUBJECT = "Try Reg AI Rule Change Tracker";

export function LandingShareButtons() {
  const [shareNote, setShareNote] = useState<string | null>(null);

  function openShareWindow(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function copyInvite(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      return true;
    } catch {
      return false;
    }
  }

  async function shareToLinkedIn() {
    const copied = await copyInvite();
    setShareNote(
      copied
        ? "Invite copied. Paste it into the LinkedIn post if the box is empty."
        : "Paste the invite into the LinkedIn post."
    );
    openShareWindow(linkedInComposeUrl(SHARE_TEXT));
  }

  async function shareToFacebook() {
    const copied = await copyInvite();
    setShareNote(
      copied
        ? "Invite copied. Paste it into the Facebook post."
        : "Paste the invite into the Facebook post."
    );
    openShareWindow(facebookShareUrl(PRODUCT_SHARE_URL));
  }

  function shareByGmail() {
    setShareNote(null);
    openShareWindow(gmailComposeUrl(EMAIL_SUBJECT, SHARE_TEXT));
  }

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div
        role="group"
        aria-label="Share Reg AI"
        className="flex flex-wrap items-center justify-center gap-2"
      >
        <ShareChip
          label="X"
          icon={<XBrandIcon />}
          onClick={() => {
            setShareNote(null);
            openShareWindow(xShareUrl(PRODUCT_SHARE_URL, SHARE_MESSAGE));
          }}
        />
        <ShareChip
          label="LinkedIn"
          icon={<LinkedInBrandIcon />}
          onClick={() => void shareToLinkedIn()}
        />
        <ShareChip
          label="Facebook"
          icon={<FacebookBrandIcon />}
          onClick={() => void shareToFacebook()}
        />
        <ShareChip
          label="Gmail"
          icon={<Mail className="h-3.5 w-3.5" aria-hidden />}
          onClick={shareByGmail}
        />
      </div>
      {shareNote ? (
        <p className={cn("rounded-md bg-background/90 px-2 py-0.5 text-xs", successTextClassName)}>
          {shareNote}
        </p>
      ) : null}
    </div>
  );
}

function ShareChip({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-foreground/80 bg-background px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
    >
      {icon}
      {label}
    </button>
  );
}
