'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  ADMIN_PASS,
  ADMIN_USER,
  AUTH_COOKIE,
  AUTH_VALUE,
} from '@/app/lib/auth';

export async function login(
  username: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return { ok: false, error: 'Invalid username or password' };
  }
  const cookieStore = await cookies();
  cookieStore.set({
    name: AUTH_COOKIE,
    value: AUTH_VALUE,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  redirect('/login');
}
