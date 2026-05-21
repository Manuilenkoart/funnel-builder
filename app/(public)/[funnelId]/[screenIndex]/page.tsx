import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { funnelsConfig } from '@/app/config/funnels';
import { recordEvent } from '@/app/lib/tracking';

import ScreenRenderer from '../QuestionType/ScreenRenderer';

export default async function FunnelScreenPage({
  params,
}: {
  params: Promise<{ funnelId: string; screenIndex: string }>;
}) {
  const { funnelId, screenIndex: screenIndexStr } = await params;
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];

  if (!config) notFound();

  const screenIndex = parseInt(screenIndexStr, 10);
  if (isNaN(screenIndex) || screenIndex < 0 || screenIndex >= config.screens.length) {
    notFound();
  }

  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (userId) {
    try {
      await recordEvent(userId, funnelId, 'page_view', screenIndexStr);
    } catch (err) {
      console.error('[tracking] recordPageView failed:', err);
    }
  }

  const screen = config.screens[screenIndex];
  const nextHref =
    screenIndex + 1 < config.screens.length
      ? `/${funnelId}/${screenIndex + 1}`
      : `/${funnelId}/paywall`;
  const prevHref = screenIndex > 0 ? `/${funnelId}/${screenIndex - 1}` : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-300 hover:shadow-indigo-500/10">
        <ScreenRenderer screen={screen} nextHref={nextHref} prevHref={prevHref} />
      </div>
    </main>
  );
}
