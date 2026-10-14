"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Mail, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FacebookBrandIcon,
  LinkedInBrandIcon,
  XBrandIcon,
} from "@/components/share/brand-icons";
import { facebookShareUrl, gmailComposeUrl, linkedInShareUrl, xShareUrl } from "@/lib/publication-share";
import { cn } from "@/lib/utils";

type PublicationShareMenuProps = {
  title: string;
  url: string;
};

export function PublicationShareMenu({ title, url }: PublicationShareMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 224;
    setMenuPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openShareWindow(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <div className="relative inline-flex justify-center">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        Share
      </Button>
      {open
        ? createPortal(
            <div
              ref={rootRef}
              id={menuId}
              role="menu"
              aria-label={`Share ${title}`}
              className="fixed z-50 w-56 rounded-md border bg-background p-1 text-left shadow-md"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <ShareItem
                label="LinkedIn"
                icon={<LinkedInBrandIcon />}
                onClick={() => openShareWindow(linkedInShareUrl(url))}
              />
              <ShareItem
                label="X"
                icon={<XBrandIcon />}
                onClick={() => openShareWindow(xShareUrl(url, title))}
              />
              <ShareItem
                label="Facebook"
                icon={<FacebookBrandIcon />}
                onClick={() => openShareWindow(facebookShareUrl(url))}
              />
              <ShareItem
                label="Gmail"
                icon={<Mail className="h-3.5 w-3.5" aria-hidden />}
                onClick={() =>
                  openShareWindow(gmailComposeUrl(title, `${title}\n\n${url}`))
                }
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function ShareItem({
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
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
        "hover:bg-accent hover:text-accent-foreground"
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
