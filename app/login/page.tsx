import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AUTH_COOKIE, isAuthValue } from '@/app/lib/auth';

import LoginForm from './LoginForm';

export default async function LoginPage() {
  const cookieStore = await cookies();
  if (isAuthValue(cookieStore.get(AUTH_COOKIE)?.value)) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <LoginForm />
      </div>
    </main>
  );
}
