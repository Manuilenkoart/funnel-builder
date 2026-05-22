import { createServerClient } from "@/app/lib/supabase/server";

export type StepMetric = {
  id: string;
  name: string;
  sub: string;
  users: number;
  time: string;
  timeSeconds: number;
  shares: number[];
};

export type ChannelMetric = {
  id: string;
  name: string;
  cls: string;
  total: number;
};

export type DashboardData = {
  steps: StepMetric[];
  channels: ChannelMetric[];
  dateRange: { from: Date | null; to: Date | null };
  totalUsers: number;
};

type RawEvent = {
  user_id: string;
  name: string;
  question_id: string;
  utm_source: string;
  funnel_id: string;
  created_at: string;
};

const CHANNEL_CLASSES = [
  "dot-organic",
  "dot-paid",
  "dot-email",
  "dot-social",
  "dot-direct",
];
const CHANNEL_SLOTS = CHANNEL_CLASSES.length;

function stepOrder(name: string, qid: string): number {
  if (name === "buy") return 1_000_000;
  if (qid === "paywall") return 999_999;
  const n = Number(qid);
  return Number.isFinite(n) ? n : 500_000;
}

function stepLabel(name: string, qid: string): { name: string; sub: string } {
  if (name === "buy") return { name: "Customer", sub: "Completed purchase" };
  if (qid === "paywall") return { name: "Paywall", sub: "Viewed pricing" };
  const n = Number(qid);
  const idx = Number.isFinite(n) ? n + 1 : qid;
  return { name: `Question ${idx}`, sub: "Answered question" };
}

function fmtDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) {
    return `0:${String(Math.round(seconds)).padStart(2, "0")}`;
  }
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86_400);
  const h = Math.round((seconds % 86_400) / 3600);
  return `${d}d ${h}h`;
}

export async function loadDashboardData(): Promise<DashboardData> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("user_id, name, question_id, utm_source, funnel_id, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[dashboard] failed to load events:", error);
  }

  const events = (data ?? []) as RawEvent[];

  const stepKeyInfo = new Map<string, { name: string; qid: string }>();
  for (const e of events) {
    const key = `${e.name}:${e.question_id}`;
    if (!stepKeyInfo.has(key)) {
      stepKeyInfo.set(key, { name: e.name, qid: e.question_id });
    }
  }
  const orderedKeys = [...stepKeyInfo.entries()]
    .sort(
      ([, a], [, b]) =>
        stepOrder(a.name, a.qid) - stepOrder(b.name, b.qid),
    )
    .map(([key]) => key);

  const userStepFirstTs = new Map<string, Map<string, number>>();
  const userFirstSource = new Map<string, string>();

  for (const e of events) {
    const ts = new Date(e.created_at).getTime();
    let stepMap = userStepFirstTs.get(e.user_id);
    if (!stepMap) {
      stepMap = new Map();
      userStepFirstTs.set(e.user_id, stepMap);
    }
    const key = `${e.name}:${e.question_id}`;
    if (!stepMap.has(key)) stepMap.set(key, ts);
    if (!userFirstSource.has(e.user_id)) {
      userFirstSource.set(e.user_id, e.utm_source || "Direct");
    }
  }

  const sourceTotals = new Map<string, number>();
  for (const src of userFirstSource.values()) {
    sourceTotals.set(src, (sourceTotals.get(src) ?? 0) + 1);
  }
  const topSources = [...sourceTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, CHANNEL_SLOTS - 1)
    .map(([src]) => src);
  const otherSources = new Set(
    [...sourceTotals.keys()].filter((s) => !topSources.includes(s)),
  );

  const sourceToIdx = new Map<string, number>();
  topSources.forEach((s, i) => sourceToIdx.set(s, i));

  const steps: StepMetric[] = orderedKeys.map((key) => {
    const info = stepKeyInfo.get(key)!;
    const slot = new Array<number>(CHANNEL_SLOTS).fill(0);
    let users = 0;
    for (const [userId, stepMap] of userStepFirstTs) {
      if (!stepMap.has(key)) continue;
      users++;
      const src = userFirstSource.get(userId) ?? "Direct";
      const idx = sourceToIdx.get(src);
      if (idx !== undefined) slot[idx]++;
      else slot[CHANNEL_SLOTS - 1]++;
    }
    const total = slot.reduce((a, b) => a + b, 0) || 1;
    const shares = slot.map((c) => (c / total) * 100);
    const label = stepLabel(info.name, info.qid);
    return {
      id: key,
      name: label.name,
      sub: label.sub,
      users,
      time: "—",
      timeSeconds: 0,
      shares,
    };
  });

  for (let i = 0; i < steps.length - 1; i++) {
    const curKey = orderedKeys[i];
    const nextKey = orderedKeys[i + 1];
    let total = 0;
    let count = 0;
    for (const stepMap of userStepFirstTs.values()) {
      const t0 = stepMap.get(curKey);
      const t1 = stepMap.get(nextKey);
      if (t0 !== undefined && t1 !== undefined && t1 >= t0) {
        total += t1 - t0;
        count++;
      }
    }
    const avgSec = count ? total / count / 1000 : 0;
    steps[i].timeSeconds = avgSec;
    steps[i].time = fmtDuration(avgSec);
  }

  const otherTotal = [...otherSources].reduce(
    (a, s) => a + (sourceTotals.get(s) ?? 0),
    0,
  );
  const channels: ChannelMetric[] = topSources.map((src, i) => ({
    id: src,
    name: src,
    cls: CHANNEL_CLASSES[i],
    total: sourceTotals.get(src) ?? 0,
  }));
  if (otherSources.size > 0 || channels.length < CHANNEL_SLOTS) {
    channels.push({
      id: "__other",
      name: otherSources.size > 0 ? "Other" : "—",
      cls: CHANNEL_CLASSES[CHANNEL_SLOTS - 1],
      total: otherTotal,
    });
  }

  const firstTs = events.length ? new Date(events[0].created_at) : null;
  const lastTs = events.length
    ? new Date(events[events.length - 1].created_at)
    : null;

  return {
    steps,
    channels,
    dateRange: { from: firstTs, to: lastTs },
    totalUsers: userFirstSource.size,
  };
}

export function formatDateRange(from: Date | null, to: Date | null): string {
  if (!from || !to) return "no data yet";
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  const monthDay = (d: Date) =>
    d.toLocaleString("en-US", { month: "short", day: "numeric" });
  if (sameMonth && from.getDate() === to.getDate()) {
    return `${monthDay(from)}, ${from.getFullYear()}`;
  }
  if (sameMonth) {
    return `${from.toLocaleString("en-US", { month: "short" })} ${from.getDate()} – ${to.getDate()}, ${to.getFullYear()}`;
  }
  if (sameYear) {
    return `${monthDay(from)} – ${monthDay(to)}, ${to.getFullYear()}`;
  }
  return `${monthDay(from)}, ${from.getFullYear()} – ${monthDay(to)}, ${to.getFullYear()}`;
}
