import { createServerClient } from './supabase/server';

export async function recordEvent(
  userId: string,
  funnelId: string,
  name: 'page_view'| 'buy',
  questionId: string | null = null
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from('users')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
  await supabase.from('events').insert({
    name,
    funnel_id: funnelId,
    question_id: questionId,
    user_id: userId,
  });
}

export async function updateUserEmail(
  userId: string,
  email: string
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from('users').update({ email }).eq('id', userId);
  if (error) throw error;
}
