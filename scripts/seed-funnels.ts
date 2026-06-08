import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { funnelsConfig } from "../app/config/funnels";
import { ensureScreenIds } from "../app/lib/funnels/schema";
import { createServerClient } from "../app/lib/supabase/server";

async function main() {
  const supabase = createServerClient();

  for (const [funnelId, cfg] of Object.entries(funnelsConfig)) {
    const draft = ensureScreenIds(cfg);

    // Upsert the funnel row (draft = seeded config).
    const { error: upErr } = await supabase
      .from("funnels")
      .upsert(
        { id: funnelId, name: funnelId, draft_config: draft },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (upErr) throw upErr;

    // Already published? Skip (idempotent).
    const { data: funnel } = await supabase
      .from("funnels")
      .select("current_version_id")
      .eq("id", funnelId)
      .single();
    if (funnel?.current_version_id) {
      console.log(`= ${funnelId}: already has a version, skipping`);
      continue;
    }

    // Create version 1 = seeded config, point current_version_id at it.
    const { data: version, error: vErr } = await supabase
      .from("funnel_versions")
      .insert({ funnel_id: funnelId, version: 1, config: draft })
      .select("id")
      .single();
    if (vErr || !version) throw vErr ?? new Error("insert version failed");

    const { error: ptrErr } = await supabase
      .from("funnels")
      .update({ current_version_id: version.id })
      .eq("id", funnelId);
    if (ptrErr) throw ptrErr;

    console.log(`+ ${funnelId}: seeded v1 (${version.id})`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
