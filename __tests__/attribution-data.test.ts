import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { first_source: string; last_source: string };

const { builder, mockState } = vi.hoisted(() => {
  const mockState: { data: unknown[]; error: unknown } = {
    data: [],
    error: null,
  };
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.lt = vi.fn(() => builder);
  builder.then = (
    resolve: (v: { data: unknown[]; error: unknown }) => unknown,
    reject?: (e: unknown) => unknown,
  ) =>
    Promise.resolve({ data: mockState.data, error: mockState.error }).then(
      resolve,
      reject,
    );
  return { builder, mockState };
});

vi.mock('@/app/lib/supabase/server', () => ({
  createServerClient: () => builder,
}));

import { loadAttributionData } from '@/app/(private)/dashboard/attribution-data';

function setRows(rows: Row[]) {
  mockState.data = rows;
  mockState.error = null;
}

describe('loadAttributionData', () => {
  beforeEach(() => {
    mockState.data = [];
    mockState.error = null;
    vi.clearAllMocks();
  });

  it('returns an empty result when there are no rows', async () => {
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(0);
    expect(result.firstTouch).toEqual([]);
    expect(result.lastTouch).toEqual([]);
    expect(result.flows).toEqual([]);
  });

  it('queries user_attribution for first_source and last_source', async () => {
    await loadAttributionData({});
    expect(builder.from).toHaveBeenCalledWith('user_attribution');
    expect(builder.select).toHaveBeenCalledWith('first_source, last_source');
  });

  it('does not constrain the query when no range is provided', async () => {
    await loadAttributionData({});
    expect(builder.gte).not.toHaveBeenCalled();
    expect(builder.lt).not.toHaveBeenCalled();
  });

  it('applies gte/lt to first_seen_at for the requested range', async () => {
    await loadAttributionData({ from: '2026-05-01', to: '2026-05-31' });
    expect(builder.gte).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-05-01T00:00:00.000Z',
    );
    expect(builder.lt).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('swaps from/to when from is after to', async () => {
    await loadAttributionData({ from: '2026-05-31', to: '2026-05-01' });
    expect(builder.gte).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-05-01T00:00:00.000Z',
    );
    expect(builder.lt).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('ignores invalid date strings', async () => {
    await loadAttributionData({ from: 'not-a-date', to: '2026/05/31' });
    expect(builder.gte).not.toHaveBeenCalled();
    expect(builder.lt).not.toHaveBeenCalled();
  });

  it('buckets firstTouch by first_source, sorted desc by user count', async () => {
    setRows([
      { first_source: 'google', last_source: 'google' },
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'facebook', last_source: 'Direct' },
    ]);
    const result = await loadAttributionData({});
    expect(result.firstTouch).toEqual([
      { source: 'google', users: 2 },
      { source: 'facebook', users: 1 },
    ]);
  });

  it('buckets lastTouch by last_source, sorted desc by user count', async () => {
    setRows([
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'facebook', last_source: 'Direct' },
      { first_source: 'google', last_source: 'google' },
    ]);
    const result = await loadAttributionData({});
    expect(result.lastTouch).toEqual([
      { source: 'Direct', users: 2 },
      { source: 'google', users: 1 },
    ]);
  });

  it('buckets flows by (first_source, last_source) pair, sorted desc by users', async () => {
    setRows([
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'google', last_source: 'google' },
      { first_source: 'facebook', last_source: 'facebook' },
    ]);
    const result = await loadAttributionData({});
    expect(result.flows).toEqual([
      { firstSource: 'google', lastSource: 'Direct', users: 2 },
      { firstSource: 'google', lastSource: 'google', users: 1 },
      { firstSource: 'facebook', lastSource: 'facebook', users: 1 },
    ]);
  });

  it('counts total users as the number of attribution rows', async () => {
    setRows([
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'facebook', last_source: 'Direct' },
      { first_source: 'twitter', last_source: 'twitter' },
    ]);
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(3);
  });

  it('returns an empty result when supabase returns an error', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockState.data = [];
    mockState.error = { message: 'boom' };
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('treats null data from supabase as no rows', async () => {
    mockState.data = null as unknown as unknown[];
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(0);
    expect(result.flows).toEqual([]);
  });
});
