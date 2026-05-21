'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { login } from '@/app/actions/auth';

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const result = await login(username, password);
    if (!result.ok) {
      setError(result.error ?? 'Login failed');
      setIsSubmitting(false);
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label
          htmlFor="username"
          className="mb-1 block text-xs font-medium text-slate-300"
        >
          Username (admin)
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError('');
          }}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white font-medium placeholder-slate-400 transition-all duration-200 hover:border-white/20 focus:border-indigo-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-xs font-medium text-slate-300"
        >
          Password (admin)
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError('');
          }}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white font-medium placeholder-slate-400 transition-all duration-200 hover:border-white/20 focus:border-indigo-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && (
          <p className="mt-2 text-sm font-medium text-rose-400">{error}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full cursor-pointer rounded-xl bg-white/80 py-3 text-base font-semibold tracking-wide shadow-lg transition-all duration-200 hover:bg-white/90 hover:shadow-indigo-500/20 active:translate-y-0.5 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
