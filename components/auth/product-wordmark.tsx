import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  md: {
    title: "text-sm font-semibold tracking-tight",
    iconWrap: "my-2 h-10 w-10 rounded-xl",
    icon: "h-5 w-5",
  },
  nav: {
    title: "text-base font-semibold tracking-tight leading-tight",
    iconWrap: "my-2.5 h-12 w-12 rounded-2xl",
    icon: "h-6 w-6",
  },
  lg: {
    title: "text-3xl font-semibold tracking-tight",
    iconWrap: "my-3 h-14 w-14 rounded-2xl",
    icon: "h-7 w-7",
  },
} as const;

export function ProductWordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: keyof typeof SIZES;
}) {
  const scale = SIZES[size];

  return (
    <span className={cn("flex flex-col items-center text-center", className)}>
      <span className={scale.title}>Reg AI</span>
      <span
        className={cn("flex items-center justify-center bg-primary text-primary-foreground", scale.iconWrap)}
        aria-hidden
      >
        <ShieldCheck className={scale.icon} />
      </span>
      <span className={scale.title}>Rule Change Tracker</span>
    </span>
  );
}
