/* eslint-disable @typescript-eslint/no-unused-vars */
import styles from "./dashboard.module.css";
import {
  type ChannelMetric,
  formatDateRange,
  loadDashboardData,
  type StepMetric,
} from "./dashboard-data";
import { CHANNEL_COLORS, fmt, sparklinePath } from "./funnel-data";

export const dynamic = "force-dynamic";

const SVG_W = 280;
const STEP_H = 76;
const MAX_W = 250;
const MIN_W = 75;
const LEFT_W = 118;
const RIGHT_W = 130;
const CX = SVG_W / 2;

const DOT_CLASSES: Record<string, string> = {
  "dot-organic": styles.dotOrganic,
  "dot-paid": styles.dotPaid,
  "dot-email": styles.dotEmail,
  "dot-social": styles.dotSocial,
  "dot-direct": styles.dotDirect,
};

function SketchDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="wf-rough">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves={2}
            seed={3}
          />
          <feDisplacementMap in="SourceGraphic" scale={2.2} />
        </filter>
        <filter id="wf-rough-2">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.06"
            numOctaves={2}
            seed={7}
          />
          <feDisplacementMap in="SourceGraphic" scale={1.4} />
        </filter>
      </defs>
    </svg>
  );
}

// TODO: trending line
// eslint-disable-next-line unused-imports/no-unused-vars
function Sparkline({
  seed,
  up,
  accent,
}: {
  seed: number;
  up: boolean;
  accent: boolean;
}) {
  const width = 110;
  const height = 20;
  const { d, last } = sparklinePath(width, height, seed, up);
  const stroke = accent ? "oklch(0.64 0.18 38)" : "#1f1b16";
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#wf-rough-2)"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}

function FunnelStepRow({
  step,
  next,
  index,
  total,
}: {
  step: StepMetric;
  next: StepMetric | undefined;
  index: number;
  total: number;
}) {
  const safeTotal = total || 1;
  const ratioTop = step.users / safeTotal;
  const ratioBot = (next?.users ?? step.users * 0.4) / safeTotal;
  const wTop = MIN_W + (MAX_W - MIN_W) * Math.min(1, ratioTop);
  const wBot = MIN_W + (MAX_W - MIN_W) * Math.min(1, ratioBot);
  const shares =
    step.shares.length && step.shares.some((s) => s > 0)
      ? step.shares
      : [100, 0, 0, 0, 0];
  const convToNext =
    next && step.users > 0
      ? ((next.users / step.users) * 100).toFixed(1) + "%"
      : null;
  const lost = next ? Math.max(0, step.users - next.users) : 0;
  const lostPct =
    next && step.users > 0
      ? ((lost / step.users) * 100).toFixed(lost / step.users < 0.1 ? 1 : 0) +
        "%"
      : null;

  const bands = shares.reduce<{
    acc: number;
    bands: { ci: number; path: string }[];
  }>(
    ({ acc, bands: out }, sh, ci) => {
      const fS = acc / 100;
      const fE = (acc + sh) / 100;
      const xTL = CX - wTop / 2 + fS * wTop;
      const xTR = CX - wTop / 2 + fE * wTop;
      const xBL = CX - wBot / 2 + fS * wBot;
      const xBR = CX - wBot / 2 + fE * wBot;
      out.push({
        ci,
        path: `M${xTL},0 L${xTR},0 L${xBR},${STEP_H} L${xBL},${STEP_H} Z`,
      });
      return { acc: acc + sh, bands: out };
    },
    { acc: 0, bands: [] },
  ).bands;
  const outer = `M${CX - wTop / 2},0 L${CX + wTop / 2},0 L${CX + wBot / 2},${STEP_H} L${CX - wBot / 2},${STEP_H} Z`;

  return (
    <>
      <div className={styles.stepRow}>
        <div className={styles.stepLeft}>
          <div className={styles.stepLabelTop}>step {index + 1}</div>
          <div className={styles.stepName}>{step.name}</div>
          <div className={styles.stepSub}>{step.sub}</div>
        </div>
        <div className={styles.stepCenter}>
          <svg width={SVG_W} height={STEP_H}>
            {bands.map((b) => (
              <path
                key={b.ci}
                d={b.path}
                fill={CHANNEL_COLORS[b.ci]}
                opacity="0.55"
                filter="url(#wf-rough-2)"
              />
            ))}
            <path
              d={outer}
              fill="none"
              stroke="#2b2620"
              strokeWidth="1.4"
              filter="url(#wf-rough-2)"
            />
          </svg>
          <div className={styles.numPillWrap}>
            <div className={styles.numPill}>
              <div className={styles.numBig}>
                {fmt(step.users, true, safeTotal)}
              </div>
              <div className={styles.numPillSub}>{fmt(step.users)} users</div>
            </div>
          </div>
        </div>
        <div className={styles.stepRight}>
          {convToNext ? (
            <>
              <div className={styles.convRow}>
                <span className={styles.convPct}>{convToNext}</span>
                <span className={styles.convNext}>→ next</span>
              </div>
              {/* TODO: trending line */}
              {/* <div style={{ marginTop: 2 }}>
                <Sparkline
                  seed={index + 3}
                  up={index % 2 === 0}
                  accent={index === 1}
                />
              </div> */}
            </>
          ) : (
            <div className={styles.endLabel}>end of funnel</div>
          )}
        </div>
      </div>
      {next && (
        <div className={styles.gapRow}>
          <div style={{ width: LEFT_W }} />
          <div style={{ width: SVG_W, position: "relative" }}>
            <div className={styles.dropoff}>
              −{fmt(lost)}
              {lostPct ? ` (${lostPct})` : ""}{" "}
              <span style={{ fontSize: 14 }}>lost</span>
            </div>
          </div>
          <div style={{ width: RIGHT_W }} />
        </div>
      )}
    </>
  );
}

export default async function DashboardPage() {
  const { steps, channels, dateRange } = await loadDashboardData();

  const first = steps[0];
  const final = steps[steps.length - 1];
  const total = first?.users ?? 0;
  const overall =
    first && final && first.users > 0
      ? ((final.users / first.users) * 100).toFixed(2)
      : "0.00";

  const maxStepSec = steps.reduce(
    (m, s) => (s.timeSeconds > m ? s.timeSeconds : m),
    0,
  );
  const accentIdx = steps.reduce(
    (best, s, i, arr) =>
      s.timeSeconds > (arr[best]?.timeSeconds ?? 0) ? i : best,
    0,
  );

  const visibleChannels = channels.filter(
    (c: ChannelMetric) => c.total > 0 || c.name !== "—",
  );

  return (
    <main className={styles.wf}>
      <SketchDefs />

      <div className={styles.header}>
        <div>
          <div className={styles.title}>Funnel Analytics</div>
          <div className={styles.subtitle}>
            {formatDateRange(dateRange.from, dateRange.to)}
          </div>
        </div>
        <div className={styles.chrome}>
          <div className={styles.pill}>
            <span className={`${styles.dot} ${styles.dotOrganic}`} />
            <span className={`${styles.dot} ${styles.dotPaid}`} />
            <span className={`${styles.dot} ${styles.dotEmail}`} />
            <span>All channels ▾</span>
          </div>
        </div>
      </div>

      <div className={styles.kpis}>
        <div className={styles.card} style={{ flex: 1 }}>
          <div className={styles.cardTitle}>Entered funnel</div>
          <div className={styles.numXl}>{fmt(first?.users ?? 0)}</div>
          <div className={styles.cardSub}>landed on site</div>
        </div>
        <div className={styles.card} style={{ flex: 1 }}>
          <div className={styles.cardTitle}>Reached final step</div>
          <div className={styles.numXl}>{fmt(final?.users ?? 0)}</div>
          <div className={styles.cardSub}>
            {final ? final.sub.toLowerCase() : "no data"}
          </div>
        </div>
        <div
          className={`${styles.card} ${styles.kpiAccent}`}
          style={{ flex: 1 }}
        >
          <div className={styles.cardTitle}>Overall conversion</div>
          <div className={styles.numXl}>{overall}%</div>
          <div className={styles.cardSub}>visit → customer</div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={`${styles.card} ${styles.funnelCard}`}>
          <div className={styles.funnelHeader}>
            <div className={styles.cardTitle}>Conversion funnel</div>
            <div className={styles.legend}>
              {visibleChannels.map((c) => (
                <span key={c.id}>
                  <span className={`${styles.dot} ${DOT_CLASSES[c.cls]}`} />{" "}
                  {c.name}
                </span>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px 0 8px" }}>
            {steps.length === 0 ? (
              <div
                style={{
                  padding: "48px 16px",
                  textAlign: "center",
                  color: "#8a8275",
                  fontFamily: "Caveat, cursive",
                  fontSize: 20,
                }}
              >
                no events yet — funnel data will appear once users hit the
                screens
              </div>
            ) : (
              steps.map((s, i) => (
                <FunnelStepRow
                  key={s.id}
                  step={s}
                  next={steps[i + 1]}
                  index={i}
                  total={total}
                />
              ))
            )}
          </div>
        </div>

        <div className={styles.rail}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Avg. time at step</div>
            <div className={styles.cardSub}>
              how long users linger before moving on
            </div>
            <div className={styles.hrSk} />
            <div className={styles.barList}>
              {steps.map((s, i) => {
                const value = maxStepSec
                  ? Math.max(4, (s.timeSeconds / maxStepSec) * 100)
                  : 0;
                return (
                  <div key={s.id} className={styles.barRow}>
                    <div className={styles.barLabel}>{s.name}</div>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${i === accentIdx && maxStepSec ? styles.barFillAccent : ""}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <div className={styles.barRight}>{s.time}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
