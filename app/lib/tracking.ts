import { createServerClient } from "./supabase/server";

export async function recordEvent(
  userId: string,
  funnelId: string,
  name: "page_view" | "buy",
  questionId: string,
  utmSource: string,
  funnelVersionId: string | null = null,
): Promise<void> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  await supabase
    .from("users")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

  await supabase.from("user_attribution").upsert(
    {
      user_id: userId,
      first_source: utmSource,
      first_seen_at: now,
      last_source: utmSource,
      last_seen_at: now,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  await supabase
    .from("user_attribution")
    .update({ last_source: utmSource, last_seen_at: now })
    .eq("user_id", userId);

  await supabase.from("events").insert({
    name,
    funnel_id: funnelId,
    question_id: questionId,
    user_id: userId,
    utm_source: utmSource,
    funnel_version_id: funnelVersionId,
  });
}

export async function updateUserEmail(
  userId: string,
  email: string,
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("users")
    .update({ email })
    .eq("id", userId);
  if (error) throw error;
}
