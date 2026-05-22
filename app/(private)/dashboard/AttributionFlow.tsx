"use client";

import { useMemo, useState } from "react";

import type { SourceFlow } from "./attribution-data";
import styles from "./dashboard.module.css";
import { CHANNEL_COLORS } from "./funnel-data";
import { computeSankeyLayout } from "./sankey-layout";

const SVG_W = 760;
const SVG_H = 460;
const NODE_W = 80;
const LEFT_X = 120;
const RIGHT_X = SVG_W - LEFT_X - NODE_W;
const GAP = 8;
const CHART_TOP = 50;
const CHART_H = SVG_H - CHART_TOP - 30;

type Tooltip = {
  x: number;
  y: number;
  firstSource: string;
  lastSource: string;
  users: number;
  share: number;
};

function colorForSource(source: string, sources: string[]): string {
  const idx = sources.indexOf(source);
  if (idx < 0) return CHANNEL_COLORS[CHANNEL_COLORS.length - 1];
  return CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
}

export default function AttributionFlow({
  flows,
  totalUsers,
}: {
  flows: SourceFlow[];
  totalUsers: number;
}) {
  const [tip, setTip] = useState<Tooltip | null>(null);

  const layout = useMemo(
    () =>
      computeSankeyLayout(flows, {
        width: SVG_W,
        height: CHART_H,
        nodeWidth: NODE_W,
        gapPx: GAP,
      }),
    [flows],
  );

  const leftSourceOrder = useMemo(
    () => layout.leftNodes.map((n) => n.source),
    [layout],
  );

  if (totalUsers === 0 || flows.length === 0) {
    return (
      <div className={styles.flowEmpty}>
        no first/last touch data yet — appears once users hit the funnel
      </div>
    );
  }

  const firstTotals = new Map<string, number>();
  for (const f of flows) {
    firstTotals.set(f.firstSource, (firstTotals.get(f.firstSource) ?? 0) + f.users);
  }

  return (
    <div className={styles.flowWrap}>
      <svg
        className={styles.flowSvg}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setTip(null)}
      >
        <defs>
          <filter id="flowRough">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.05"
              numOctaves={2}
              seed={9}
            />
            <feDisplacementMap in="SourceGraphic" scale={1.2} />
          </filter>
        </defs>

        <text
          x={LEFT_X + NODE_W / 2}
          y={28}
          textAnchor="middle"
          className={styles.flowAxis}
        >
          FIRST TOUCH
        </text>
        <text
          x={RIGHT_X + NODE_W / 2}
          y={28}
          textAnchor="middle"
          className={styles.flowAxis}
        >
          LAST TOUCH
        </text>

        {layout.ribbons.map((r, i) => {
          const lY1 = CHART_TOP + r.leftY;
          const lY2 = lY1 + r.leftH;
          const rY1 = CHART_TOP + r.rightY;
          const rY2 = rY1 + r.rightH;
          const xL = LEFT_X + NODE_W;
          const xR = RIGHT_X;
          const midX = (xL + xR) / 2;
          const d =
            `M${xL},${lY1} C${midX},${lY1} ${midX},${rY1} ${xR},${rY1} ` +
            `L${xR},${rY2} C${midX},${rY2} ${midX},${lY2} ${xL},${lY2} Z`;
          const color = colorForSource(r.firstSource, leftSourceOrder);
          const firstTotal = firstTotals.get(r.firstSource) ?? r.users;
          const share = firstTotal > 0 ? (r.users / firstTotal) * 100 : 0;
          const active =
            tip &&
            tip.firstSource === r.firstSource &&
            tip.lastSource === r.lastSource;
          return (
            <path
              key={i}
              d={d}
              fill={color}
              opacity={active ? 0.95 : 0.5}
              stroke={active ? "#1f1b16" : "none"}
              strokeWidth={active ? 1.4 : 0}
              onMouseEnter={(e) =>
                setTip({
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                  firstSource: r.firstSource,
                  lastSource: r.lastSource,
                  users: r.users,
                  share,
                })
              }
              onMouseMove={(e) =>
                setTip((cur) =>
                  cur
                    ? { ...cur, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }
                    : cur,
                )
              }
            />
          );
        })}

        <g filter="url(#flowRough)">
          {layout.leftNodes.map((n) => {
            const y = CHART_TOP + n.y;
            const color = colorForSource(n.source, leftSourceOrder);
            return (
              <g key={`l-${n.source}`}>
                <rect
                  x={LEFT_X}
                  y={y}
                  width={NODE_W}
                  height={n.height}
                  fill={color}
                  opacity={0.85}
                  stroke="#2b2620"
                  strokeWidth={1.4}
                />
                <text
                  x={LEFT_X + NODE_W / 2}
                  y={y + n.height / 2 + 2}
                  textAnchor="middle"
                  className={styles.flowNodeLabel}
                >
                  {n.source} · {n.total}
                </text>
              </g>
            );
          })}
        </g>

        <g filter="url(#flowRough)">
          {layout.rightNodes.map((n) => {
            const y = CHART_TOP + n.y;
            const color = colorForSource(n.source, leftSourceOrder);
            return (
              <g key={`r-${n.source}`}>
                <rect
                  x={RIGHT_X}
                  y={y}
                  width={NODE_W}
                  height={n.height}
                  fill={color}
                  opacity={0.85}
                  stroke="#2b2620"
                  strokeWidth={1.4}
                />
                <text
                  x={RIGHT_X + NODE_W / 2}
                  y={y + n.height / 2 + 2}
                  textAnchor="middle"
                  className={styles.flowNodeLabel}
                >
                  {n.source} · {n.total}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {tip && (
        <div
          className={styles.flowTip}
          style={{
            left: `calc(${(tip.x / SVG_W) * 100}% + 12px)`,
            top: `calc(${(tip.y / SVG_H) * 100}% + 12px)`,
          }}
        >
          <div className={styles.flowTipPair}>
            <strong>{tip.firstSource}</strong> → <strong>{tip.lastSource}</strong>
          </div>
          <div className={styles.flowTipBody}>
            <span className={styles.flowTipNum}>{tip.users} users</span>
            <span className={styles.flowTipPct}>
              {tip.share.toFixed(1)}% of {tip.firstSource}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
