'use server';

import { cookies } from 'next/headers';

import { createServerClient } from '@/app/lib/supabase/server';
import { recordEvent, updateUserEmail } from '@/app/lib/tracking';
import { EMAIL_REGEX } from '@/app/lib/validation';

export async function saveEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: 'Invalid email' };
  }
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (!userId) return { ok: false, error: 'No user session' };
  try {
    const supabase = createServerClient();

    // Check if this email belongs to an existing user
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser && existingUser.id !== userId) {
      // Returning user — switch the session cookie to their account
      cookieStore.set('userId', existingUser.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    } else {
      // New email — attach it to the current anonymous session
      await updateUserEmail(userId, email);
    }
    return { ok: true };
  } catch (err) {
    console.error('[tracking] saveEmail failed:', err);
    return { ok: false, error: 'Failed to save email' };
  }
}

export async function recordBuyEvent(
  funnelId: string,
  utmSource: string
): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (!userId) return { ok: false, error: 'No user session' };
  try {
    await recordEvent(userId, funnelId, 'buy', 'paywall', utmSource);
    return { ok: true };
  } catch (err) {
    console.error('[tracking] recordBuyEvent failed:', err);
    return { ok: false, error: 'Failed to record buy event' };
  }
}
