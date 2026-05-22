"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import styles from "./dashboard.module.css";

type Props = {
  from: string;
  to: string;
};

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return toISODate(d);
}

export default function DateRangeFilter({ from, to }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (nextFrom: string | null, nextTo: string | null) => {
    const params = new URLSearchParams();
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
    });
  };

  return (
    <div className={styles.filter} data-pending={pending ? "true" : undefined}>
      <div className={styles.filterInputs}>
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => apply(e.target.value || null, to || null)}
          className={styles.filterInput}
          aria-label="From date"
        />
        <span className={styles.filterDash}>–</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => apply(from || null, e.target.value || null)}
          className={styles.filterInput}
          aria-label="To date"
        />
      </div>
      <div className={styles.filterPresets}>
        <button
          type="button"
          className={styles.filterPreset}
          onClick={() => {
            const t = todayISO();
            apply(t, t);
          }}
        >
          Today
        </button>
        <button
          type="button"
          className={styles.filterPreset}
          onClick={() => apply(daysAgoISO(6), todayISO())}
        >
          7d
        </button>
        <button
          type="button"
          className={styles.filterPreset}
          onClick={() => apply(daysAgoISO(29), todayISO())}
        >
          30d
        </button>
        <button
          type="button"
          className={styles.filterPreset}
          onClick={() => apply("2026-01-01", todayISO())}
        >
          All time
        </button>
      </div>
    </div>
  );
}
