"use client";

import { useEffect, useState } from "react";

type OrganizationLogoAvatarProps = {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

/** Circular org logo (or initials fallback) shown next to organization names. */
export function OrganizationLogoAvatar({
  name,
  logoUrl,
  size = "sm",
  className = "",
}: OrganizationLogoAvatarProps) {
  const sizeClass = SIZE_CLASS[size];
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [logoUrl]);

  if (logoUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={`${sizeClass} shrink-0 rounded-full border border-border object-cover ${className}`}
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-medium text-muted-foreground ${className}`}
    >
      {initialsFor(name)}
    </span>
  );
}
