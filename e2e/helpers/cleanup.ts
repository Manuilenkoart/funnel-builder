import { createClient } from '@supabase/supabase-js';

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local'
    );
  }
  return createClient(url, key);
}

// Module-level singleton — env vars are fixed for the entire test run.
const supabase = createSupabaseClient();

export async function cleanupByUserId(userId: string): Promise<void> {
  const r1 = await supabase.from('events').delete().eq('user_id', userId);
  if (r1.error) throw new Error(`cleanup events: ${r1.error.message}`);

  const r2 = await supabase.from('user_attribution').delete().eq('user_id', userId);
  if (r2.error) throw new Error(`cleanup user_attribution: ${r2.error.message}`);

  const r3 = await supabase.from('users').delete().eq('id', userId);
  if (r3.error) throw new Error(`cleanup users: ${r3.error.message}`);
}

export async function cleanupByEmail(email: string): Promise<void> {
  const { data, error } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (error) throw new Error(`cleanupByEmail lookup: ${error.message}`);
  if (data) {
    await cleanupByUserId(data.id);
  }
}

export async function seedUser(email: string): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('users').insert({ id, email });
  if (error) throw new Error(`seedUser: ${error.message}`);
  return { id };
}
