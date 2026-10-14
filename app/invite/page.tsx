import type { Route } from "next";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Legacy /invite links redirect to /join (adblockers often block "invite" URLs). */
export default async function InviteRedirectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const tokenRaw = params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  if (token) {
    redirect(`/join?token=${encodeURIComponent(token)}` as Route);
  }
  redirect("/join" as Route);
}
