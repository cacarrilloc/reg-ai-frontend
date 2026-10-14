import { DashboardShell } from "@/components/dashboard/shell";
import { ReviewQueueWorkspace } from "@/components/reviews/review-queue-workspace";

export default function ReviewsPage() {
  return (
    <DashboardShell title="CCO Review Queue" description="Manage pending approvals, review assignments, and policy redlines.">
      <ReviewQueueWorkspace />
    </DashboardShell>
  );
}
