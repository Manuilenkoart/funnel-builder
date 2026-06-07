import Link from "next/link";

interface ProgressBarProps {
  step: number;
  total: number;
  backHref?: string | null;
}

export default function ProgressBar({
  step,
  total,
  backHref,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, ((step + 1) / total) * 100));
  return (
    <div className="mb-7 flex h-8 items-center gap-3 px-6">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back"
          className="flex size-8 shrink-0 items-center justify-center rounded-full border-[0.5px] border-white/[0.32] bg-white/[0.14] text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,0.55),inset_0_-0.5px_0_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.10)] backdrop-blur-[18px] backdrop-saturate-[180%] transition active:scale-[0.94]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path
              d="M9 2L4 7l5 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      ) : null}

      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--lg-progress-track)]">
        <div
          className="h-full rounded-full bg-[var(--lg-accent)] transition-[width] duration-[400ms] ease-[cubic-bezier(.32,.72,0,1)]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="text-xs font-medium tabular-nums tracking-[0.4px] text-[var(--lg-muted)]">
        {step + 1} / {total}
      </div>
    </div>
  );
}
