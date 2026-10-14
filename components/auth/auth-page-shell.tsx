import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AUTH_FRAME_CLASS, AUTH_SHELL_INNER_CLASS } from "@/components/auth/auth-frame";
import { LoginBackground } from "@/components/auth/login-background";
import { ProductWordmark } from "@/components/auth/product-wordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for /sign-in and /sign-up so users can always return home.
 */
export function AuthPageShell({
  children,
  title,
  className,
}: {
  children: React.ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <LoginBackground priority />
      <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
        <Button asChild variant="outline" size="sm" className="bg-background">
          <Link href={"/" as Route}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to home
          </Link>
        </Button>
      </div>

      <div
        className={cn(
          AUTH_FRAME_CLASS,
          "relative z-10 flex w-full max-w-sm flex-col overflow-hidden",
          className
        )}
      >
        <Link
          href={"/" as Route}
          className="flex w-full flex-col items-center px-5 pb-2 pt-5 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ProductWordmark />
          <span className="mt-1 block text-xs text-muted-foreground">{title}</span>
        </Link>
        <div className={cn("flex w-full flex-col items-center", AUTH_SHELL_INNER_CLASS)}>
          {children}
        </div>
      </div>
    </main>
  );
}
