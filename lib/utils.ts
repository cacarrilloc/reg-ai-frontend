import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Confirmation and success copy (invites, subscribe, saved settings). */
export const successTextClassName = "text-emerald-700 dark:text-emerald-400";
export const successIconClassName = "text-emerald-600";
