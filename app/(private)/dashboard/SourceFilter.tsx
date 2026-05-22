"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import styles from "./dashboard.module.css";

type Props = {
  sources: string[];
  value: string;
};

export default function SourceFilter({ sources, value }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("source", next);
    else params.delete("source");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
    });
  };

  return (
    <label
      className={styles.sourcePill}
      data-pending={pending ? "true" : undefined}
    >
      <select
        className={styles.sourceSelect}
        value={value}
        onChange={(e) => apply(e.target.value)}
        aria-label="Filter by utm source"
      >
        <option value="">All channels</option>
        {sources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
