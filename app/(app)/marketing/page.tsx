import { DashboardShell } from "@/components/dashboard/shell";
import { MarketingReviewWorkspace } from "@/components/marketing/marketing-review-workspace";

export default function MarketingPage() {
  return (
    <DashboardShell
      title="Marketing Content Reviewer"
      description="This is a review for the CCO’s consideration. It is not an approval. Accuracy of underlying performance is not verified."
    >
      <MarketingReviewWorkspace />
    </DashboardShell>
  );
}
