import { createServerClient } from "@/app/lib/supabase/server";

import { ensureScreenIds, funnelConfigSchema } from "./schema";

export async function publishVersion(funnelId: string): Promise<string> {
  const supabase = createServerClient();

  const { data: funnel, error: fErr } = await supabase
    .from("funnels")
    .select("draft_config")
    .eq("id", funnelId)
    .single();
  if (fErr || !funnel) throw fErr ?? new Error(`Funnel not found: ${funnelId}`);

  // Validate + guarantee every screen has a stable id before freezing.
  const config = ensureScreenIds(funnelConfigSchema.parse(funnel.draft_config));

  const { data: latest } = await supabase
    .from("funnel_versions")
    .select("version")
    .eq("funnel_id", funnelId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((latest?.version as number | undefined) ?? 0) + 1;

  const { data: inserted, error: vErr } = await supabase
    .from("funnel_versions")
    .insert({ funnel_id: funnelId, version: nextVersion, config })
    .select("id")
    .single();
  if (vErr || !inserted) throw vErr ?? new Error("Failed to insert version");

  const { error: uErr } = await supabase
    .from("funnels")
    .update({
      current_version_id: inserted.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", funnelId);
  if (uErr) throw uErr;

  return inserted.id as string;
}
