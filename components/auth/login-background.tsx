import Image from "next/image";
import loginBackground from "@/images/background-login.jpg";

/** Full-viewport login artwork for the home page and auth flow. */
export function LoginBackground({ priority = false }: { priority?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <Image
        src={loginBackground}
        alt=""
        fill
        sizes="100vw"
        priority={priority}
        className="object-cover object-center"
      />
    </div>
  );
}
