import type { SourceFlow } from "./attribution-data";

export type SankeyDims = {
  width: number;
  height: number;
  nodeWidth: number;
  gapPx: number;
};

export type SankeyNode = {
  source: string;
  total: number;
  y: number;
  height: number;
};

export type SankeyRibbon = {
  firstSource: string;
  lastSource: string;
  users: number;
  leftY: number;
  leftH: number;
  rightY: number;
  rightH: number;
};

export type SankeyLayout = {
  leftNodes: SankeyNode[];
  rightNodes: SankeyNode[];
  ribbons: SankeyRibbon[];
};

function buildNodes(
  flows: SourceFlow[],
  side: "left" | "right",
  height: number,
  gapPx: number,
): SankeyNode[] {
  const totals = new Map<string, number>();
  for (const f of flows) {
    const key = side === "left" ? f.firstSource : f.lastSource;
    totals.set(key, (totals.get(key) ?? 0) + f.users);
  }
  const entries = [...totals.entries()].sort(([, a], [, b]) => b - a);
  const grandTotal = entries.reduce((s, [, n]) => s + n, 0);
  if (grandTotal === 0 || entries.length === 0) return [];

  const gapsTotal = gapPx * Math.max(0, entries.length - 1);
  const usableH = Math.max(0, height - gapsTotal);
  const pxPerUser = usableH / grandTotal;

  let y = 0;
  return entries.map(([source, total]) => {
    const h = total * pxPerUser;
    const node: SankeyNode = { source, total, y, height: h };
    y += h + gapPx;
    return node;
  });
}

export function computeSankeyLayout(
  flows: SourceFlow[],
  dims: SankeyDims,
): SankeyLayout {
  const positiveFlows = flows.filter((f) => f.users > 0);
  if (positiveFlows.length === 0) {
    return { leftNodes: [], rightNodes: [], ribbons: [] };
  }

  const leftNodes = buildNodes(positiveFlows, "left", dims.height, dims.gapPx);
  const rightNodes = buildNodes(positiveFlows, "right", dims.height, dims.gapPx);

  const leftIndex = new Map(leftNodes.map((n, i) => [n.source, i]));
  const rightIndex = new Map(rightNodes.map((n, i) => [n.source, i]));

  const sortedFlows = [...positiveFlows].sort((a, b) => {
    const la = leftIndex.get(a.firstSource) ?? 0;
    const lb = leftIndex.get(b.firstSource) ?? 0;
    if (la !== lb) return la - lb;
    const ra = rightIndex.get(a.lastSource) ?? 0;
    const rb = rightIndex.get(b.lastSource) ?? 0;
    return ra - rb;
  });

  const leftCursor = new Map<string, number>();
  const rightCursor = new Map<string, number>();
  leftNodes.forEach((n) => leftCursor.set(n.source, n.y));
  rightNodes.forEach((n) => rightCursor.set(n.source, n.y));

  const grandTotal = leftNodes.reduce((s, n) => s + n.total, 0);
  const leftUsableH = dims.height - dims.gapPx * Math.max(0, leftNodes.length - 1);
  const leftPxPerUser = grandTotal === 0 ? 0 : leftUsableH / grandTotal;
  const rightUsableH = dims.height - dims.gapPx * Math.max(0, rightNodes.length - 1);
  const rightPxPerUser = grandTotal === 0 ? 0 : rightUsableH / grandTotal;

  const ribbons: SankeyRibbon[] = sortedFlows.map((f) => {
    const leftH = f.users * leftPxPerUser;
    const rightH = f.users * rightPxPerUser;
    const leftY = leftCursor.get(f.firstSource) ?? 0;
    const rightY = rightCursor.get(f.lastSource) ?? 0;
    leftCursor.set(f.firstSource, leftY + leftH);
    rightCursor.set(f.lastSource, rightY + rightH);
    return {
      firstSource: f.firstSource,
      lastSource: f.lastSource,
      users: f.users,
      leftY,
      leftH,
      rightY,
      rightH,
    };
  });

  return { leftNodes, rightNodes, ribbons };
}
