import Image from "next/image";
import appWatermark from "@/images/background.jpg";

/** Paper color sampled from background.jpg so the canvas matches the photo. */
const PAGE_CANVAS = "#e4e4e8";

/** Same faint shield pattern on every page. Pinned to the viewport so it never recrops. */
export function AppWatermark({ priority = false }: { priority?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ backgroundColor: PAGE_CANVAS }} />
      <Image
        src={appWatermark}
        alt=""
        fill
        sizes="100vw"
        priority={priority}
        className="object-cover object-center opacity-10"
      />
    </div>
  );
}
