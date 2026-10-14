import { Badge } from "@/components/ui/badge";
import {
  gapTriggerLabel,
  isBusinessChangeTrigger,
  isMarketingContentTrigger,
  type GapTriggerType,
} from "@/lib/gap-trigger";
import { cn } from "@/lib/utils";

type TriggerBadgeProps = {
  triggerType: GapTriggerType | null | undefined;
};

/** Trigger badge: filled for business changes and marketing reviews. */
export function TriggerBadge({ triggerType }: TriggerBadgeProps) {
  const filled =
    isBusinessChangeTrigger(triggerType) || isMarketingContentTrigger(triggerType);
  return (
    <Badge
      variant="outline"
      className={cn(
        filled && "border-transparent bg-foreground text-background"
      )}
    >
      {gapTriggerLabel(triggerType)}
    </Badge>
  );
}
