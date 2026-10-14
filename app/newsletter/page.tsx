"use client";

import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AppLegalFooter } from "@/components/brand/app-legal-footer";
import { AppWatermark } from "@/components/brand/app-watermark";
import { PageChromeCard } from "@/components/dashboard/shell";
import { NewsletterSubscribeCard } from "@/components/publications/newsletter-subscribe-card";
import { PublicationsFeed } from "@/components/publications/publications-feed";
import { Button } from "@/components/ui/button";

export default function NewsletterPage() {
  return (
    <div className="relative isolate min-h-screen">
      <AppWatermark priority />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-6 pb-4 pt-6 md:px-8 md:pt-8">
        <PageChromeCard
          title="Reg-AI Newsletter"
          description="The Monday Regulatory Brief is built from the same SEC, FINRA, and CFTC publications as the Regulatory Feed."
          titleClassName="text-3xl"
          className="bg-card"
          actions={
            <Button asChild size="sm" className="bg-black text-white hover:bg-black/90">
              <Link href={"/" as Route}>Go to Reg-AI</Link>
            </Button>
          }
        >
          <Suspense
            fallback={
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening newsletter…
              </div>
            }
          >
            <NewsletterSubscribeCard />
          </Suspense>
        </PageChromeCard>
        <PublicationsFeed mode="public" />
        <AppLegalFooter className="mt-auto w-full min-w-0" />
      </main>
    </div>
  );
}
