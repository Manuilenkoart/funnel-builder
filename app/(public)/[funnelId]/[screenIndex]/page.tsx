import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import { funnelsConfig } from '@/app/config/funnels';
import { getUtmSource } from '@/app/lib/source';
import { recordEvent } from '@/app/lib/tracking';
import { withParams } from '@/app/lib/url';
import { QuestionType } from '@/app/types/funnel';

import Motif from '../components/Motif';
import ProgressBar from '../components/ProgressBar';
import Shell from '../components/Shell';
import ScreenRenderer from '../QuestionType/ScreenRenderer';
import VoicePreloader from '../QuestionType/VoiceInput/VoicePreloader';

export default async function FunnelScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string; screenIndex: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { funnelId, screenIndex: screenIndexStr } = await params;
  const sp = await searchParams;
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];

  if (!config) notFound();

  const screenIndex = parseInt(screenIndexStr, 10);
  if (isNaN(screenIndex) || screenIndex < 0 || screenIndex >= config.screens.length) {
    notFound();
  }

  const utmSource = getUtmSource(sp);

  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (userId) {
    // Defer tracking until after the response is sent so the four DB
    // round-trips in recordEvent don't block this screen's TTFB.
    after(async () => {
      try {
        await recordEvent(userId, funnelId, 'page_view', screenIndexStr, utmSource);
      } catch (err) {
        console.error('[tracking] recordPageView failed:', err);
      }
    });
  }

  const screen = config.screens[screenIndex];
  const shouldPreloadVoice = config.screens
    .slice(screenIndex)
    .some((s) => s.type === QuestionType.voice);
  const nextHref = withParams(
    screenIndex + 1 < config.screens.length
      ? `/${funnelId}/${screenIndex + 1}`
      : `/${funnelId}/paywall`,
    sp
  );
  const prevHref =
    screenIndex > 0 ? withParams(`/${funnelId}/${screenIndex - 1}`, sp) : null;

  return (
    <Shell>
      {shouldPreloadVoice ? <VoicePreloader /> : null}
      <ProgressBar
        step={screenIndex}
        total={config.screens.length}
        backHref={prevHref}
      />
      <div className="flex flex-1 flex-col px-6">
        <div className="mb-7 flex justify-center">
          <Motif />
        </div>
        <div className="flex flex-1 flex-col">
          <ScreenRenderer screen={screen} nextHref={nextHref} prevHref={prevHref} />
        </div>
      </div>
    </Shell>
  );
}
