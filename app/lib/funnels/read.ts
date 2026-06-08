import { unstable_cache } from "next/cache";

import { createServerClient } from "@/app/lib/supabase/server";

import { type FunnelConfig, parseFunnelConfig } from "./schema";

async function fetchVersionConfig(versionId: string): Promise<FunnelConfig> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("funnel_versions")
    .select("config")
    .eq("id", versionId)
    .single();
  if (error || !data)
    throw error ?? new Error(`Version not found: ${versionId}`);
  return parseFunnelConfig(data.config);
}

// Versions are immutable, so caching by version id never needs invalidation.
const cachedVersionConfig = unstable_cache(
  fetchVersionConfig,
  ["funnel-version"],
  {
    tags: ["funnel-version"],
  },
);

export function getVersionConfig(versionId: string): Promise<FunnelConfig> {
  return cachedVersionConfig(versionId);
}

export async function getAssignedVersionId(
  userId: string,
  funnelId: string,
): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("funnel_assignments")
    .select("version_id")
    .eq("user_id", userId)
    .eq("funnel_id", funnelId)
    .maybeSingle();
  return data?.version_id ?? null;
}

export async function funnelExists(funnelId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("funnels")
    .select("id")
    .eq("id", funnelId)
    .maybeSingle();
  return Boolean(data);
}

export async function getFunnelForUser(
  funnelId: string,
  userId?: string,
): Promise<{ config: FunnelConfig; versionId: string } | null> {
  const supabase = createServerClient();

  let versionId = userId ? await getAssignedVersionId(userId, funnelId) : null;

  if (!versionId) {
    const { data: funnel } = await supabase
      .from("funnels")
      .select("current_version_id")
      .eq("id", funnelId)
      .maybeSingle();
    if (!funnel?.current_version_id) return null;
    versionId = funnel.current_version_id as string;

    if (userId) {
      // Ensure the user row exists so the assignment FK is satisfiable.
      await supabase
        .from("users")
        .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
      // Sticky first-touch pin; ignoreDuplicates makes concurrent first
      // requests race-safe (first insert wins).
      await supabase
        .from("funnel_assignments")
        .upsert(
          { user_id: userId, funnel_id: funnelId, version_id: versionId },
          { onConflict: "user_id,funnel_id", ignoreDuplicates: true },
        );
      // Re-read in case a concurrent request pinned a different version first.
      versionId = (await getAssignedVersionId(userId, funnelId)) ?? versionId;
    }
  }

  const config = await getVersionConfig(versionId);
  return { config, versionId };
}
