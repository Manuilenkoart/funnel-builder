import type { SourceFlow } from "./attribution-data";
import styles from "./dashboard.module.css";
import { CHANNEL_COLORS } from "./funnel-data";

const DEFAULT_LIMIT = 10;

function colorForSource(source: string, sources: string[]): string {
  const idx = sources.indexOf(source);
  if (idx < 0) return CHANNEL_COLORS[CHANNEL_COLORS.length - 1];
  return CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
}

export default function FlowTable({
  flows,
  expandAll = false,
  expandHref,
}: {
  flows: SourceFlow[];
  expandAll?: boolean;
  expandHref?: string;
}) {
  if (flows.length === 0) return null;

  const firstTotals = new Map<string, number>();
  for (const f of flows) {
    firstTotals.set(f.firstSource, (firstTotals.get(f.firstSource) ?? 0) + f.users);
  }

  const maxUsers = flows.reduce((m, f) => (f.users > m ? f.users : m), 0);

  const visible = expandAll ? flows : flows.slice(0, DEFAULT_LIMIT);
  const hiddenCount = expandAll ? 0 : Math.max(0, flows.length - DEFAULT_LIMIT);

  const sourceOrder = [...firstTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([s]) => s);

  return (
    <table className={styles.flowTable}>
      <thead>
        <tr>
          <th>from</th>
          <th />
          <th>to</th>
          <th style={{ textAlign: "right" }}>users</th>
          <th style={{ textAlign: "right" }}>share</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {visible.map((f) => {
          const firstTotal = firstTotals.get(f.firstSource) ?? f.users;
          const share = firstTotal > 0 ? (f.users / firstTotal) * 100 : 0;
          const barPct = maxUsers > 0 ? (f.users / maxUsers) * 100 : 0;
          const color = colorForSource(f.firstSource, sourceOrder);
          return (
            <tr key={`${f.firstSource}>${f.lastSource}`}>
              <td className={styles.flowSrc}>
                <span className={styles.flowSwatch} style={{ background: color }} />
                {f.firstSource}
              </td>
              <td className={styles.flowArrow}>→</td>
              <td className={styles.flowDst}>{f.lastSource}</td>
              <td className={styles.flowCount}>{f.users}</td>
              <td className={styles.flowPct}>{share.toFixed(0)}%</td>
              <td className={styles.flowBarCell}>
                <div className={styles.flowBarBg}>
                  <div
                    className={styles.flowBarFill}
                    style={{ width: `${barPct}%`, background: color }}
                  />
                </div>
              </td>
            </tr>
          );
        })}
        {hiddenCount > 0 && expandHref && (
          <tr className={styles.flowExpandRow}>
            <td colSpan={6}>
              <a href={expandHref}>… show all ({hiddenCount} more)</a>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
