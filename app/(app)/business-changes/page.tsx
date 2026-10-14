import { BusinessChangeForm } from "@/components/business-changes/business-change-form";
import { BusinessChangeHistory } from "@/components/business-changes/business-change-history";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardShell } from "@/components/dashboard/shell";

const examples = [
  "New product or service",
  "New process or workflow",
  "New hire or responsibility change",
  "New market, regulator, or jurisdiction"
];

export default function BusinessChangesPage() {
  return (
    <DashboardShell
      title="Business Changes"
      description="Log internal events and receive AI regulatory analysis documents grounded in matched government references."
    >
      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <BusinessChangeForm />

        <Card className="flex h-full min-h-0 flex-col">
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardTitle className="text-sm">Review triggers</CardTitle>
            <CardDescription className="text-xs">
              Evaluated against the review taxonomy.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-4 pt-0">
            <ul className="my-2 list-outside list-disc space-y-1.5 pl-6 text-xs marker:text-muted-foreground">
              {examples.map((item) => (
                <li key={item} className="pl-1 font-semibold leading-snug text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <BusinessChangeHistory />
      </section>
    </DashboardShell>
  );
}
