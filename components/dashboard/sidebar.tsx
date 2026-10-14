"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BriefcaseBusiness,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FileText,
  Gauge,
  History,
  Landmark,
  LifeBuoy,
  Library,
  Megaphone,
  Settings,
} from "lucide-react";
import { ProductWordmark } from "@/components/auth/product-wordmark";

type NavLink = {
  type?: "link";
  label: string;
  href: string;
  icon: typeof Gauge;
};

type NavDivider = {
  type: "divider";
};

type NavItem = NavLink | NavDivider;

const navItems: NavItem[] = [
  { type: "divider" },
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Regulatory Feed", href: "/publications", icon: Landmark },
  { type: "divider" },
  { label: "Policy Library Reviewer", href: "/policies", icon: Library },
  { label: "Marketing Content Reviewer", href: "/marketing", icon: Megaphone },
  { label: "Business Changes Reviewer", href: "/business-changes", icon: BriefcaseBusiness },
  { type: "divider" },
  { label: "Compliance Gaps", href: "/compliance-gaps", icon: FileSearch },
  { label: "CCO Review Queue", href: "/reviews", icon: FileText },
  { type: "divider" },
  { label: "Insights", href: "/insights", icon: ChartColumn },
  { label: "Audit History", href: "/audit", icon: History },
  { type: "divider" },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Support", href: "/support", icon: LifeBuoy },
  { type: "divider" },
];

const STORAGE_KEY = "reg-ai.sidebar-width";
const DEFAULT_WIDTH = 208; // w-52
const MIN_WIDTH = 184;
/** Equal strip of background on the left of the menu and before main content. */
const SIDEBAR_GUTTER_PX = 24;

function maxSidebarWidth(): number {
  if (typeof window === "undefined") {
    return 480;
  }
  return Math.floor(window.innerWidth / 2);
}

function clampWidth(width: number): number {
  return Math.min(maxSidebarWidth(), Math.max(MIN_WIDTH, Math.round(width)));
}

function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }
  return href !== "/" && pathname.startsWith(`${href}/`);
}

function readStoredWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_WIDTH;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WIDTH;
  }
  return clampWidth(parsed);
}

export function Sidebar() {
  const pathname = usePathname();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(width);
  const handleId = useId();

  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    function onResize() {
      setWidth((current) => clampWidth(current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const persistWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidth(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      setIsDragging(true);

      const onMove = (moveEvent: PointerEvent) => {
        persistWidth(moveEvent.clientX - SIDEBAR_GUTTER_PX);
      };

      const onUp = (upEvent: PointerEvent) => {
        handle.releasePointerCapture(upEvent.pointerId);
        setIsDragging(false);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        persistWidth(widthRef.current);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [persistWidth]
  );

  const atMax = width >= maxSidebarWidth() - 2;
  const atMin = width <= MIN_WIDTH + 2;

  return (
    <aside
      className="sticky top-6 z-20 my-6 hidden h-fit max-h-[calc(100vh-3rem)] shrink-0 self-start px-6 md:top-8 md:my-8 md:max-h-[calc(100vh-4rem)] lg:block"
      style={{ width: width + SIDEBAR_GUTTER_PX * 2 }}
      aria-label="Primary navigation"
    >
      <div className="relative rounded-xl border bg-card py-5" style={{ width }}>
        <div className="max-h-[calc(100vh-6.5rem)] overflow-x-hidden overflow-y-auto px-3 md:max-h-[calc(100vh-8.5rem)]">
          <h1 className="mb-6 flex justify-center px-1">
            <ProductWordmark size="nav" />
          </h1>

          <nav className="space-y-0.5">
          {navItems.map((item, index) => {
            if (item.type === "divider") {
              return (
                <div
                  key={`divider-${index}`}
                  role="separator"
                  className="my-2.5 border-t-2 border-foreground/31"
                />
              );
            }

            const isActive = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                  isActive
                    ? "bg-muted text-foreground shadow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          </nav>
        </div>

      <button
        id={handleId}
        type="button"
        aria-label="Resize navigation menu"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxSidebarWidth()}
        aria-valuenow={width}
        aria-orientation="vertical"
        role="separator"
        title="Drag to widen or narrow the menu"
        onPointerDown={startDrag}
        className={`absolute inset-y-0 -right-3 z-20 flex w-6 cursor-col-resize items-center justify-center border-0 bg-transparent p-0 ${
          isDragging ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <span
          className={`flex h-14 w-4 flex-col items-center justify-center rounded-full border bg-card shadow-sm transition ${
            isDragging ? "border-foreground/40 bg-muted" : "border-border"
          }`}
        >
          <ChevronLeft className={`h-3 w-3 ${atMin ? "opacity-30" : ""}`} aria-hidden />
          <span className="my-0.5 h-4 w-px bg-current opacity-40" aria-hidden />
          <ChevronRight className={`h-3 w-3 ${atMax ? "opacity-30" : ""}`} aria-hidden />
        </span>
      </button>
      </div>
    </aside>
  );
}
