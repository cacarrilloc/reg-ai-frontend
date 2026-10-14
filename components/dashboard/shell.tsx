import type { ReactNode } from "react";
import { AuthControls } from "@/components/auth/auth-controls";
import { AppLegalFooter } from "@/components/brand/app-legal-footer";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Page titles sitting on the watermark, outside cards. */
export const pageChromeTitleClassName = "!font-bold tracking-tight text-foreground";

/** Subtitles and other copy sitting on the watermark, outside cards. */
export const pageChromeCopyClassName = "!font-bold text-foreground";

/** White card for titles/copy that would otherwise sit on the watermark. Aligns with page cards. */
export function PageChromeCard({
  title,
  description,
  actions,
  titleClassName,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleClassName?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("w-full min-w-0 overflow-hidden bg-clip-padding", className)}>
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className={cn(pageChromeTitleClassName, titleClassName)}>{title}</CardTitle>
          {description ? (
            <CardDescription className={cn("mt-2", pageChromeCopyClassName)}>{description}</CardDescription>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </CardHeader>
      {children ? <CardContent className="pt-0">{children}</CardContent> : null}
    </Card>
  );
}

export function DashboardShell({
  title,
  description,
  children,
  headerActions,
  headerStatus,
  headerExtra,
}: {
  title: string;
  description: ReactNode;
  children: React.ReactNode;
  headerActions?: ReactNode;
  headerStatus?: ReactNode;
  headerExtra?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full min-w-0">
      <Sidebar />
      <main className="relative z-10 min-w-0 flex-1 pb-4 pl-0 pr-6 pt-6 md:pb-4 md:pl-0 md:pr-8 md:pt-8">
        <div className="flex w-full min-w-0 flex-col gap-6 md:min-h-[calc(100dvh-4rem)]">
          <div className="w-full min-w-0">
            <PageChromeCard
              title={title}
              description={description}
              titleClassName="text-3xl"
              className={headerExtra ? "rounded-b-none border-b-0 shadow-none" : undefined}
              actions={
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {headerActions}
                  <AuthControls />
                </div>
              }
            >
              {headerStatus}
            </PageChromeCard>
            {headerExtra}
          </div>
          <div className="w-full min-w-0 overflow-x-clip">{children}</div>
          <AppLegalFooter className="mt-auto w-full min-w-0" />
        </div>
      </main>
    </div>
  );
}
