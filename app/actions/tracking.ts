'use server';

import { cookies } from 'next/headers';

import { updateUserEmail } from '@/app/lib/tracking';

export async function saveEmail(email: string): Promise<void> {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (!userId) return;
  await updateUserEmail(userId, email);
}
