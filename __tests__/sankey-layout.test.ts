import { describe, expect, it } from 'vitest';

import { computeSankeyLayout } from '@/app/(private)/dashboard/sankey-layout';

const DIMS = { width: 760, height: 460, nodeWidth: 80, gapPx: 8 };

describe('computeSankeyLayout', () => {
  it('returns empty layout when there are no flows', () => {
    const layout = computeSankeyLayout([], DIMS);
    expect(layout.leftNodes).toEqual([]);
    expect(layout.rightNodes).toEqual([]);
    expect(layout.ribbons).toEqual([]);
  });

  it('creates one left node, one right node, and one ribbon for a single flow', () => {
    const layout = computeSankeyLayout(
      [{ firstSource: 'google', lastSource: 'Direct', users: 10 }],
      DIMS,
    );
    expect(layout.leftNodes).toHaveLength(1);
    expect(layout.rightNodes).toHaveLength(1);
    expect(layout.ribbons).toHaveLength(1);
    expect(layout.leftNodes[0]).toMatchObject({ source: 'google', total: 10 });
    expect(layout.rightNodes[0]).toMatchObject({ source: 'Direct', total: 10 });
    expect(layout.ribbons[0]).toMatchObject({
      firstSource: 'google',
      lastSource: 'Direct',
      users: 10,
    });
  });

  it('orders left nodes by total descending', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'small', lastSource: 'Direct', users: 1 },
        { firstSource: 'big', lastSource: 'Direct', users: 10 },
        { firstSource: 'mid', lastSource: 'Direct', users: 5 },
      ],
      DIMS,
    );
    expect(layout.leftNodes.map((n) => n.source)).toEqual(['big', 'mid', 'small']);
  });

  it('orders right nodes by total descending', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'small', users: 1 },
        { firstSource: 'a', lastSource: 'big', users: 10 },
        { firstSource: 'a', lastSource: 'mid', users: 5 },
      ],
      DIMS,
    );
    expect(layout.rightNodes.map((n) => n.source)).toEqual(['big', 'mid', 'small']);
  });

  it('sums totals from multiple flows touching the same node', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'google', lastSource: 'Direct', users: 7 },
        { firstSource: 'google', lastSource: 'google', users: 3 },
      ],
      DIMS,
    );
    expect(layout.leftNodes[0]).toMatchObject({ source: 'google', total: 10 });
    expect(
      layout.rightNodes.reduce((s, n) => s + n.total, 0),
    ).toBe(10);
  });

  it('produces left ribbon slices that stack within their source node', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'google', lastSource: 'a', users: 6 },
        { firstSource: 'google', lastSource: 'b', users: 4 },
      ],
      DIMS,
    );
    const node = layout.leftNodes.find((n) => n.source === 'google')!;
    const ribbons = layout.ribbons.filter((r) => r.firstSource === 'google');
    const sumH = ribbons.reduce((s, r) => s + r.leftH, 0);
    expect(sumH).toBeCloseTo(node.height, 5);
    for (const r of ribbons) {
      expect(r.leftY).toBeGreaterThanOrEqual(node.y);
      expect(r.leftY + r.leftH).toBeLessThanOrEqual(node.y + node.height + 1e-6);
    }
  });

  it('produces right ribbon slices that stack within their target node', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'Direct', users: 6 },
        { firstSource: 'b', lastSource: 'Direct', users: 4 },
      ],
      DIMS,
    );
    const node = layout.rightNodes.find((n) => n.source === 'Direct')!;
    const ribbons = layout.ribbons.filter((r) => r.lastSource === 'Direct');
    const sumH = ribbons.reduce((s, r) => s + r.rightH, 0);
    expect(sumH).toBeCloseTo(node.height, 5);
    for (const r of ribbons) {
      expect(r.rightY).toBeGreaterThanOrEqual(node.y);
      expect(r.rightY + r.rightH).toBeLessThanOrEqual(node.y + node.height + 1e-6);
    }
  });

  it('node heights are proportional to user count', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'x', users: 10 },
        { firstSource: 'b', lastSource: 'x', users: 5 },
      ],
      DIMS,
    );
    const a = layout.leftNodes.find((n) => n.source === 'a')!;
    const b = layout.leftNodes.find((n) => n.source === 'b')!;
    expect(a.height).toBeCloseTo(b.height * 2, 5);
  });

  it('left and right node columns share the same total user count', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'x', users: 4 },
        { firstSource: 'b', lastSource: 'y', users: 3 },
        { firstSource: 'a', lastSource: 'y', users: 2 },
      ],
      DIMS,
    );
    const leftSum = layout.leftNodes.reduce((s, n) => s + n.total, 0);
    const rightSum = layout.rightNodes.reduce((s, n) => s + n.total, 0);
    expect(leftSum).toBe(9);
    expect(rightSum).toBe(9);
  });
});
