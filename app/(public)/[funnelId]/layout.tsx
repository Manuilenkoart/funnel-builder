import { ClarityFunnelContext } from "@/app/components/ClarityFunnelContext";

export default async function FunnelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;

  return (
    <>
      <ClarityFunnelContext funnelId={funnelId} />
      {children}
    </>
  );
}
