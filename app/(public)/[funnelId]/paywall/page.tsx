'use client';

import { use } from 'react';
import Link from 'next/link';
import { funnelsConfig } from '@/app/config/funnels';

export default function FunnelPaywallPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = use(params);
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <p>Funnel not found</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white font-sans">
      <div className="w-full max-w-lg p-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-300">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
          Final Step: Unlock Access
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
          Choose Your Plan
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Get lifetime access to the private dashboard and all custom premium tools.
        </p>

        {/* Pricing Cards */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Option 1 */}
          <div className="relative p-6 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400/50 hover:bg-white/10 transition-all duration-200 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold">Standard Plan</h3>
              <p className="mt-1 text-xs text-slate-400">Basic features & setup</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-3xl font-extrabold">$19</span>
                <span className="ml-1 text-sm text-slate-400">/one-time</span>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="mt-6 block w-full py-2.5 text-center rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold transition-all duration-200"
            >
              Get Started
            </Link>
          </div>

          {/* Option 2 (Popular) */}
          <div className="relative p-6 rounded-xl bg-indigo-600/20 border-2 border-indigo-500 hover:bg-indigo-600/30 transition-all duration-200 flex flex-col justify-between shadow-lg shadow-indigo-500/10">
            <span className="absolute -top-3 right-4 px-2 py-0.5 rounded-full bg-indigo-500 text-[10px] font-bold uppercase tracking-wider">
              Popular
            </span>
            <div>
              <h3 className="text-lg font-bold">Premium Plan</h3>
              <p className="mt-1 text-xs text-indigo-200">Full access & updates</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-3xl font-extrabold">$49</span>
                <span className="ml-1 text-sm text-indigo-200">/one-time</span>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="mt-6 block w-full py-2.5 text-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold transition-all duration-200 shadow-md"
            >
              Get Premium
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            30-day money back guarantee. Safe & secure payment.
          </p>
        </div>
      </div>
    </main>
  );
}
