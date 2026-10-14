import { useSyncExternalStore } from "react";

/** True after hydration; false during SSR. Avoids server/client UI attribute mismatches. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
