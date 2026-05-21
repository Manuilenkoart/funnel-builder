import { redirect } from "next/navigation";

export default async function FunnelLandingPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  redirect(`/${funnelId}/0`);
}
