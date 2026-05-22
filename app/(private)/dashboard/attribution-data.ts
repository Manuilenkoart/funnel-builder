import { createServerClient } from "@/app/lib/supabase/server";

import type { DashboardRange } from "./dashboard-data";

export type SourceBreakdown = {
  source: string;
  users: number;
};

export type SourceFlow = {
  firstSource: string;
  lastSource: string;
  users: number;
};

export type AttributionData = {
  firstTouch: SourceBreakdown[];
  lastTouch: SourceBreakdown[];
  flows: SourceFlow[];
  totalUsers: number;
};

type Row = { first_source: string; last_source: string };

const DAY_MS = 86_400_000;

function parseISODate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toBreakdown(m: Map<string, number>): SourceBreakdown[] {
  return [...m.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([source, users]) => ({ source, users }));
}

export async function loadAttributionData(
  range: DashboardRange = {},
): Promise<AttributionData> {
  const supabase = createServerClient();

  let fromDate = parseISODate(range.from);
  let toDate = parseISODate(range.to);
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    [fromDate, toDate] = [toDate, fromDate];
  }

  let query = supabase
    .from("user_attribution")
    .select("first_source, last_source");

  if (fromDate) query = query.gte("first_seen_at", fromDate.toISOString());
  if (toDate) {
    const exclusiveEnd = new Date(toDate.getTime() + DAY_MS);
    query = query.lt("first_seen_at", exclusiveEnd.toISOString());
  }

  const { data, error } = await query;
  if (error) console.error("[dashboard] failed to load attribution:", error);

  const rows = (data ?? []) as Row[];

  const firstCounts = new Map<string, number>();
  const lastCounts = new Map<string, number>();
  const flowCounts = new Map<string, number>();

  // Null character — guaranteed not to appear in a URL query parameter value.
  const FLOW_SEP = "\x00";

  for (const r of rows) {
    firstCounts.set(r.first_source, (firstCounts.get(r.first_source) ?? 0) + 1);
    lastCounts.set(r.last_source, (lastCounts.get(r.last_source) ?? 0) + 1);
    const key = `${r.first_source}${FLOW_SEP}${r.last_source}`;
    flowCounts.set(key, (flowCounts.get(key) ?? 0) + 1);
  }

  const flows: SourceFlow[] = [...flowCounts.entries()]
    .map(([key, users]) => {
      const sep = key.indexOf(FLOW_SEP);
      const firstSource = key.slice(0, sep);
      const lastSource = key.slice(sep + 1);
      return { firstSource, lastSource, users };
    })
    .sort((a, b) => b.users - a.users);

  return {
    firstTouch: toBreakdown(firstCounts),
    lastTouch: toBreakdown(lastCounts),
    flows,
    totalUsers: rows.length,
  };
}
