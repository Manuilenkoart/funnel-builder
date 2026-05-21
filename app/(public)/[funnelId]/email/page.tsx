'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { funnelsConfig } from '@/app/config/funnels';

export default function FunnelEmailPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = use(params);
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <p>Funnel not found</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required');
      return;
    }
    // Simple email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Move to next step (paywall)
    router.push(`/${funnelId}/paywall`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-300">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
          Step 2: Save Progress
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
          Where should we send your results?
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Enter your email to receive your personalized roadmap and continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="sr-only">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              className="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 focus:border-indigo-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200 text-base font-medium placeholder-slate-400"
            />
            {error && (
              <p className="mt-2 text-sm text-rose-400 font-medium">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-base font-semibold tracking-wide transition-all duration-200 cursor-pointer shadow-lg hover:shadow-indigo-500/20 active:translate-y-0.5"
          >
            Continue to Results
          </button>
        </form>
      </div>
    </main>
  );
}
