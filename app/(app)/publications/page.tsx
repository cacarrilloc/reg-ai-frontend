import { DashboardShell } from "@/components/dashboard/shell";
import { PublicationsFeed } from "@/components/publications/publications-feed";

export default function PublicationsPage() {
  return (
    <DashboardShell
      title="Regulatory Feed"
      description="Review new notices and their current policy-change processing state."
    >
      <PublicationsFeed />
    </DashboardShell>
  );
}
