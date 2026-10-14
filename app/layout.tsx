import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SupabaseProvider } from "@/components/providers/supabase-provider";
import { AppProviders } from "@/components/providers/app-providers";
import { PRODUCT_SHARE_URL, productShareMessage } from "@/lib/product-share";
import "./globals.css";

const productDescription = productShareMessage();

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCT_SHARE_URL),
  title: "Reg AI Rule Change Tracker",
  description: productDescription,
  openGraph: {
    title: "Reg AI Rule Change Tracker",
    description: productDescription,
    url: PRODUCT_SHARE_URL,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Reg AI Rule Change Tracker",
    description: productDescription,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SupabaseProvider>
          <AppProviders>{children}</AppProviders>
        </SupabaseProvider>
        <Analytics />
      </body>
    </html>
  );
}
