'use server';

import { cookies } from 'next/headers';

import { updateUserEmail } from '@/app/lib/tracking';
import { EMAIL_REGEX } from '@/app/lib/validation';

export async function saveEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: 'Invalid email' };
  }
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (!userId) return { ok: false, error: 'No user session' };
  try {
    await updateUserEmail(userId, email);
    return { ok: true };
  } catch (err) {
    console.error('[tracking] saveEmail failed:', err);
    return { ok: false, error: 'Failed to save email' };
  }
}
