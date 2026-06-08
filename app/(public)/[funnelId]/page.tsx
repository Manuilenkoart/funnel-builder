import { notFound, redirect } from "next/navigation";

import { funnelExists } from "@/app/lib/funnels/read";
import { withParams } from "@/app/lib/url";

export default async function FunnelLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { funnelId } = await params;
  const sp = await searchParams;
  if (!(await funnelExists(funnelId))) notFound();
  redirect(withParams(`/${funnelId}/0`, sp));
}
