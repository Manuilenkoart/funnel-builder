import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { funnelsConfig } from "@/app/config/funnels";
import { getUtmSource } from "@/app/lib/source";
import { recordEvent } from "@/app/lib/tracking";

import Motif from "../_components/Motif";
import Shell from "../_components/Shell";
import PaywallChoice from "./PaywallChoice";

export default async function FunnelPaywallPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { funnelId } = await params;
  const sp = await searchParams;
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];

  if (!config) notFound();

  const utmSource = getUtmSource(sp);

  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (userId) {
    try {
      await recordEvent(userId, funnelId, "page_view", "paywall", utmSource);
    } catch (err) {
      console.error("[tracking] recordPageView failed:", err);
    }
  }

  return (
    <Shell>
      <div className="flex flex-1 flex-col px-6">
        <div className="mt-2 mb-4 flex justify-center">
          <Motif />
        </div>

        <h1 className="glass-heading compact mb-2.5">Begin your practice</h1>
        <p className="glass-sub mb-5" style={{ fontSize: 14 }}>
          7-day free trial. Cancel anytime.
        </p>

        <div className="mb-[18px] flex items-center justify-center gap-2">
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} width="13" height="13" viewBox="0 0 13 13">
                <path
                  d="M6.5 0.5l1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-2-3.6 2 .7-4.1-3-2.9 4.1-.6z"
                  fill="#FFD27A"
                />
              </svg>
            ))}
          </div>
          <span
            className="text-xs"
            style={{
              color: "var(--lg-muted)",
              letterSpacing: 0.1,
              textShadow: "0 1px 2px rgba(0,0,0,0.18)",
            }}
          >
            4.9 · loved by 180,000+ reflectors
          </span>
        </div>

        <PaywallChoice funnelId={funnelId} utmSource={utmSource} />

        <div className="flex-1" />
      </div>
    </Shell>
  );
}
