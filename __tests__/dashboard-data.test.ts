import { beforeEach, describe, expect, it, vi } from 'vitest';

type RawEvent = {
  user_id: string;
  name: string;
  question_id: string;
  utm_source: string;
  funnel_id: string;
  created_at: string;
};

const { builder, mockState } = vi.hoisted(() => {
  const mockState: { data: unknown[]; error: unknown } = {
    data: [],
    error: null,
  };
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
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

import { loadDashboardData } from '@/app/(private)/dashboard/dashboard-data';

function setEvents(events: RawEvent[]) {
  mockState.data = events;
  mockState.error = null;
}

function ev(over: Partial<RawEvent> = {}): RawEvent {
  return {
    user_id: 'u1',
    name: 'page_view',
    question_id: '0',
    utm_source: 'google',
    funnel_id: 'q',
    created_at: '2026-05-20T10:00:00.000Z',
    ...over,
  };
}

describe('loadDashboardData', () => {
  beforeEach(() => {
    mockState.data = [];
    mockState.error = null;
    vi.clearAllMocks();
  });

  it('returns an empty dashboard when there are no events', async () => {
    const result = await loadDashboardData();
    expect(result.totalUsers).toBe(0);
    expect(result.steps).toEqual([]);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toMatchObject({
      id: '__other',
      name: '—',
      total: 0,
    });
    expect(result.dateRange).toEqual({ from: null, to: null });
  });

  it('queries the events table and orders by created_at ascending', async () => {
    await loadDashboardData();
    expect(builder.from).toHaveBeenCalledWith('events');
    expect(builder.select).toHaveBeenCalledWith(
      'user_id, name, question_id, utm_source, funnel_id, created_at',
    );
    expect(builder.order).toHaveBeenCalledWith('created_at', {
      ascending: true,
    });
  });

  it('counts each user once per step', async () => {
    setEvents([
      ev({ user_id: 'u1', created_at: '2026-05-20T10:00:00.000Z' }),
      ev({ user_id: 'u1', created_at: '2026-05-20T10:00:05.000Z' }),
      ev({
        user_id: 'u2',
        utm_source: 'facebook',
        created_at: '2026-05-20T10:05:00.000Z',
      }),
    ]);
    const result = await loadDashboardData();
    expect(result.totalUsers).toBe(2);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].users).toBe(2);
  });

  it('orders steps by numeric question id, then paywall, then buy', async () => {
    setEvents([
      ev({
        question_id: 'paywall',
        created_at: '2026-05-20T10:02:00.000Z',
      }),
      ev({
        name: 'buy',
        question_id: 'paywall',
        created_at: '2026-05-20T10:03:00.000Z',
      }),
      ev({ question_id: '2', created_at: '2026-05-20T10:01:00.000Z' }),
      ev({ question_id: '0', created_at: '2026-05-20T10:00:00.000Z' }),
    ]);
    const result = await loadDashboardData();
    expect(result.steps.map((s) => s.name)).toEqual([
      'Question 1',
      'Question 3',
      'Paywall',
      'Customer',
    ]);
  });

  it('labels numeric questions with a 1-based index', async () => {
    setEvents([ev({ question_id: '4' })]);
    const result = await loadDashboardData();
    expect(result.steps[0]).toMatchObject({
      name: 'Question 5',
      sub: 'Answered question',
    });
  });

  it('labels paywall and buy steps with their dedicated copy', async () => {
    setEvents([
      ev({
        question_id: 'paywall',
        created_at: '2026-05-20T10:00:00.000Z',
      }),
      ev({
        name: 'buy',
        question_id: 'paywall',
        created_at: '2026-05-20T10:01:00.000Z',
      }),
    ]);
    const result = await loadDashboardData();
    expect(result.steps[0]).toMatchObject({
      name: 'Paywall',
      sub: 'Viewed pricing',
    });
    expect(result.steps[1]).toMatchObject({
      name: 'Customer',
      sub: 'Completed purchase',
    });
  });

  it("attributes each user to their first event's utm_source", async () => {
    setEvents([
      ev({
        user_id: 'u1',
        utm_source: 'google',
        question_id: '0',
        created_at: '2026-05-20T10:00:00.000Z',
      }),
      ev({
        user_id: 'u1',
        utm_source: 'facebook',
        question_id: '1',
        created_at: '2026-05-20T10:01:00.000Z',
      }),
    ]);
    const result = await loadDashboardData();
    expect(result.channels.find((c) => c.id === 'google')?.total).toBe(1);
    expect(result.channels.find((c) => c.id === 'facebook')).toBeUndefined();
  });

  it('treats an empty utm_source as "Direct"', async () => {
    setEvents([ev({ utm_source: '' })]);
    const result = await loadDashboardData();
    expect(result.channels.find((c) => c.id === 'Direct')?.total).toBe(1);
  });

  it('keeps the top four channels and groups the rest under "Other"', async () => {
    const events: RawEvent[] = [];
    const sources: Array<{ name: string; count: number }> = [
      { name: 'a', count: 5 },
      { name: 'b', count: 4 },
      { name: 'c', count: 3 },
      { name: 'd', count: 2 },
      { name: 'e', count: 1 },
      { name: 'f', count: 1 },
    ];
    let uid = 0;
    let t = Date.parse('2026-05-20T10:00:00.000Z');
    for (const s of sources) {
      for (let i = 0; i < s.count; i++) {
        events.push(
          ev({
            user_id: `u${uid++}`,
            utm_source: s.name,
            created_at: new Date(t).toISOString(),
          }),
        );
        t += 1000;
      }
    }
    setEvents(events);
    const result = await loadDashboardData();
    expect(result.channels.map((c) => c.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      '__other',
    ]);
    expect(result.channels.find((c) => c.id === '__other')).toMatchObject({
      name: 'Other',
      total: 2,
    });
  });

  it('computes channel share percentages that sum to 100', async () => {
    setEvents([
      ev({
        user_id: 'u1',
        utm_source: 'google',
        created_at: '2026-05-20T10:00:00.000Z',
      }),
      ev({
        user_id: 'u2',
        utm_source: 'google',
        created_at: '2026-05-20T10:01:00.000Z',
      }),
      ev({
        user_id: 'u3',
        utm_source: 'facebook',
        created_at: '2026-05-20T10:02:00.000Z',
      }),
    ]);
    const result = await loadDashboardData();
    const shares = result.steps[0].shares;
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    expect(shares[0]).toBeCloseTo(200 / 3, 5);
    expect(shares[1]).toBeCloseTo(100 / 3, 5);
    expect(shares.slice(2)).toEqual([0, 0, 0]);
  });

  it('averages time between consecutive steps and formats it', async () => {
    setEvents([
      ev({
        user_id: 'u1',
        question_id: '0',
        created_at: '2026-05-20T10:00:00.000Z',
      }),
      ev({
        user_id: 'u1',
        question_id: '1',
        created_at: '2026-05-20T10:00:30.000Z',
      }),
      ev({
        user_id: 'u2',
        question_id: '0',
        created_at: '2026-05-20T10:00:00.000Z',
      }),
      ev({
        user_id: 'u2',
        question_id: '1',
        created_at: '2026-05-20T10:01:00.000Z',
      }),
    ]);
    const result = await loadDashboardData();
    expect(result.steps[0].timeSeconds).toBe(45);
    expect(result.steps[0].time).toBe('0:45');
    // Last step has no successor, so its time is left as a placeholder.
    expect(result.steps[1].time).toBe('—');
  });

  it('formats minute-range averages as M:SS', async () => {
    setEvents([
      ev({
        question_id: '0',
        created_at: '2026-05-20T10:00:00.000Z',
      }),
      ev({
        question_id: '1',
        created_at: '2026-05-20T10:02:30.000Z',
      }),
    ]);
    const result = await loadDashboardData();
    expect(result.steps[0].time).toBe('2:30');
  });

  it('falls back to the first and last event timestamps when no range is given', async () => {
    setEvents([
      ev({ created_at: '2026-05-20T10:00:00.000Z' }),
      ev({
        question_id: '1',
        created_at: '2026-05-22T11:00:00.000Z',
      }),
    ]);
    const result = await loadDashboardData();
    expect(result.dateRange.from?.toISOString()).toBe(
      '2026-05-20T10:00:00.000Z',
    );
    expect(result.dateRange.to?.toISOString()).toBe(
      '2026-05-22T11:00:00.000Z',
    );
  });

  it('parses provided range as UTC midnight', async () => {
    const result = await loadDashboardData({
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(result.dateRange.from?.toISOString()).toBe(
      '2026-05-01T00:00:00.000Z',
    );
    expect(result.dateRange.to?.toISOString()).toBe(
      '2026-05-31T00:00:00.000Z',
    );
  });

  it('ignores invalid date strings and falls back to event extremes', async () => {
    setEvents([ev({ created_at: '2026-05-20T10:00:00.000Z' })]);
    const result = await loadDashboardData({
      from: 'not-a-date',
      to: '2026/05/31',
    });
    expect(result.dateRange.from?.toISOString()).toBe(
      '2026-05-20T10:00:00.000Z',
    );
    expect(result.dateRange.to?.toISOString()).toBe(
      '2026-05-20T10:00:00.000Z',
    );
  });

  it('swaps from and to when from is after to', async () => {
    const result = await loadDashboardData({
      from: '2026-05-31',
      to: '2026-05-01',
    });
    expect(result.dateRange.from?.toISOString()).toBe(
      '2026-05-01T00:00:00.000Z',
    );
    expect(result.dateRange.to?.toISOString()).toBe(
      '2026-05-31T00:00:00.000Z',
    );
  });

  it('applies gte and lt to the supabase query, with lt set to to + 1 day', async () => {
    await loadDashboardData({ from: '2026-05-01', to: '2026-05-31' });
    expect(builder.gte).toHaveBeenCalledWith(
      'created_at',
      '2026-05-01T00:00:00.000Z',
    );
    expect(builder.lt).toHaveBeenCalledWith(
      'created_at',
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('does not constrain the query when no range is provided', async () => {
    await loadDashboardData();
    expect(builder.gte).not.toHaveBeenCalled();
    expect(builder.lt).not.toHaveBeenCalled();
  });

  it('returns an empty dashboard when supabase returns an error', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockState.data = [];
    mockState.error = { message: 'boom' };
    const result = await loadDashboardData();
    expect(result.totalUsers).toBe(0);
    expect(result.steps).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  describe('edge cases', () => {
    it('formats exactly 60 seconds as 1:00', async () => {
      setEvents([
        ev({
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          question_id: '1',
          created_at: '2026-05-20T10:01:00.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      expect(result.steps[0].time).toBe('1:00');
    });

    it('formats exactly one hour as 1h 0m', async () => {
      setEvents([
        ev({
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          question_id: '1',
          created_at: '2026-05-20T11:00:00.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      expect(result.steps[0].time).toBe('1h 0m');
    });

    it('formats sub-hour durations as Hh Mm', async () => {
      setEvents([
        ev({
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          question_id: '1',
          created_at: '2026-05-20T12:30:00.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      expect(result.steps[0].time).toBe('2h 30m');
    });

    it('formats day-range durations as Dd Hh', async () => {
      setEvents([
        ev({
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          question_id: '1',
          created_at: '2026-05-22T13:00:00.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      expect(result.steps[0].time).toBe('2d 3h');
    });

    it('rounds fractional seconds in 0:SS formatting', async () => {
      setEvents([
        ev({
          user_id: 'u1',
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u1',
          question_id: '1',
          created_at: '2026-05-20T10:00:45.500Z',
        }),
        ev({
          user_id: 'u2',
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u2',
          question_id: '1',
          created_at: '2026-05-20T10:00:46.500Z',
        }),
      ]);
      const result = await loadDashboardData();
      expect(result.steps[0].timeSeconds).toBe(46);
      expect(result.steps[0].time).toBe('0:46');
    });

    it('treats null data from supabase as no events', async () => {
      mockState.data = null as unknown as unknown[];
      const result = await loadDashboardData();
      expect(result.totalUsers).toBe(0);
      expect(result.steps).toEqual([]);
      expect(result.dateRange).toEqual({ from: null, to: null });
    });

    it('logs the error but still uses data when both are returned', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockState.data = [
        ev({
          user_id: 'u1',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
      ];
      mockState.error = { message: 'partial' };
      const result = await loadDashboardData();
      expect(consoleSpy).toHaveBeenCalled();
      expect(result.totalUsers).toBe(1);
      expect(result.steps).toHaveLength(1);
      consoleSpy.mockRestore();
    });

    it('applies only gte when only "from" is provided and falls back to lastTs for "to"', async () => {
      setEvents([
        ev({ created_at: '2026-05-21T08:00:00.000Z' }),
        ev({
          question_id: '1',
          created_at: '2026-05-23T09:00:00.000Z',
        }),
      ]);
      const result = await loadDashboardData({ from: '2026-05-20' });
      expect(builder.gte).toHaveBeenCalledWith(
        'created_at',
        '2026-05-20T00:00:00.000Z',
      );
      expect(builder.lt).not.toHaveBeenCalled();
      expect(result.dateRange.from?.toISOString()).toBe(
        '2026-05-20T00:00:00.000Z',
      );
      expect(result.dateRange.to?.toISOString()).toBe(
        '2026-05-23T09:00:00.000Z',
      );
    });

    it('applies only lt when only "to" is provided and falls back to firstTs for "from"', async () => {
      setEvents([
        ev({ created_at: '2026-05-21T08:00:00.000Z' }),
        ev({
          question_id: '1',
          created_at: '2026-05-23T09:00:00.000Z',
        }),
      ]);
      const result = await loadDashboardData({ to: '2026-05-31' });
      expect(builder.gte).not.toHaveBeenCalled();
      expect(builder.lt).toHaveBeenCalledWith(
        'created_at',
        '2026-06-01T00:00:00.000Z',
      );
      expect(result.dateRange.from?.toISOString()).toBe(
        '2026-05-21T08:00:00.000Z',
      );
      expect(result.dateRange.to?.toISOString()).toBe(
        '2026-05-31T00:00:00.000Z',
      );
    });

    it('handles a single-day range where from equals to', async () => {
      await loadDashboardData({ from: '2026-05-15', to: '2026-05-15' });
      expect(builder.gte).toHaveBeenCalledWith(
        'created_at',
        '2026-05-15T00:00:00.000Z',
      );
      expect(builder.lt).toHaveBeenCalledWith(
        'created_at',
        '2026-05-16T00:00:00.000Z',
      );
    });

    it('keeps the earliest timestamp when a user has repeated events for the same step', async () => {
      setEvents([
        ev({
          user_id: 'u1',
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u1',
          question_id: '0',
          created_at: '2026-05-20T10:05:00.000Z',
        }),
        ev({
          user_id: 'u1',
          question_id: '1',
          created_at: '2026-05-20T10:01:00.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      // Time between step 0 and step 1 should use the *first* step-0 ts (10:00),
      // not the duplicate at 10:05.
      expect(result.steps[0].timeSeconds).toBe(60);
      expect(result.steps[0].users).toBe(1);
    });

    it('excludes users who never reached the next step from the time average', async () => {
      setEvents([
        ev({
          user_id: 'u1',
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u1',
          question_id: '1',
          created_at: '2026-05-20T10:01:00.000Z',
        }),
        ev({
          user_id: 'u2',
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u3',
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u3',
          question_id: '1',
          created_at: '2026-05-20T10:02:00.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      // Only u1 (60s) and u3 (120s) progressed → avg = 90s.
      expect(result.steps[0].timeSeconds).toBe(90);
      expect(result.steps[0].users).toBe(3);
      expect(result.steps[1].users).toBe(2);
    });

    it('skips users whose next-step timestamp precedes the current step', async () => {
      // u1 hits "question 1" at 10:00 (regex puts step 1 after step 0 in order),
      // then "question 0" at 10:05. Their step-0 ts is later than step-1 ts,
      // so they should not contribute to the step-0 → step-1 time average.
      setEvents([
        ev({
          user_id: 'u1',
          question_id: '1',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u1',
          question_id: '0',
          created_at: '2026-05-20T10:05:00.000Z',
        }),
        ev({
          user_id: 'u2',
          question_id: '0',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          user_id: 'u2',
          question_id: '1',
          created_at: '2026-05-20T10:02:00.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      // Only u2 contributes: 120s.
      expect(result.steps[0].timeSeconds).toBe(120);
    });

    it('sorts channels by total descending', async () => {
      const events: RawEvent[] = [];
      let uid = 0;
      let t = Date.parse('2026-05-20T10:00:00.000Z');
      // Insert in deliberately non-ranked order to prove the sort works.
      const sources: Array<{ name: string; count: number }> = [
        { name: 'small', count: 1 },
        { name: 'big', count: 5 },
        { name: 'medium', count: 3 },
      ];
      for (const s of sources) {
        for (let i = 0; i < s.count; i++) {
          events.push(
            ev({
              user_id: `u${uid++}`,
              utm_source: s.name,
              created_at: new Date(t).toISOString(),
            }),
          );
          t += 1000;
        }
      }
      setEvents(events);
      const result = await loadDashboardData();
      expect(
        result.channels
          .filter((c) => c.id !== '__other')
          .map((c) => ({ id: c.id, total: c.total })),
      ).toEqual([
        { id: 'big', total: 5 },
        { id: 'medium', total: 3 },
        { id: 'small', total: 1 },
      ]);
    });

    it('puts all users in the last channel slot when their source is grouped under "Other"', async () => {
      // 5 unique sources, each with 1 user → top 4 fill slots 0–3, the 5th
      // user is "Other" and lands in slot 4.
      const events: RawEvent[] = [];
      const sources = ['a', 'b', 'c', 'd', 'e'];
      let t = Date.parse('2026-05-20T10:00:00.000Z');
      sources.forEach((s, i) => {
        events.push(
          ev({
            user_id: `u${i}`,
            utm_source: s,
            created_at: new Date(t).toISOString(),
          }),
        );
        t += 1000;
      });
      setEvents(events);
      const result = await loadDashboardData();
      expect(result.steps[0].shares).toEqual([20, 20, 20, 20, 20]);
      expect(result.channels[4]).toMatchObject({
        id: '__other',
        name: 'Other',
        total: 1,
      });
    });

    it('handles a funnel that only contains paywall and buy steps', async () => {
      setEvents([
        ev({
          question_id: 'paywall',
          created_at: '2026-05-20T10:00:00.000Z',
        }),
        ev({
          name: 'buy',
          question_id: 'paywall',
          created_at: '2026-05-20T10:01:30.000Z',
        }),
      ]);
      const result = await loadDashboardData();
      expect(result.steps.map((s) => s.name)).toEqual(['Paywall', 'Customer']);
      expect(result.steps[0].timeSeconds).toBe(90);
      expect(result.steps[1].time).toBe('—');
    });

    it('uses the provided range even when there are no events', async () => {
      const result = await loadDashboardData({
        from: '2026-05-01',
        to: '2026-05-31',
      });
      expect(result.totalUsers).toBe(0);
      expect(result.dateRange.from?.toISOString()).toBe(
        '2026-05-01T00:00:00.000Z',
      );
      expect(result.dateRange.to?.toISOString()).toBe(
        '2026-05-31T00:00:00.000Z',
      );
    });
  });
});
