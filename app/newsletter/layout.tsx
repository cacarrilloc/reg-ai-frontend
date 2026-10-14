import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reg-AI Newsletter",
  description:
    "Subscribe to the Monday Regulatory Brief: AI summaries of new SEC, FINRA, and CFTC publications.",
};

export default function NewsletterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
