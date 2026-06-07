import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEq, mockInsert, mockUpsert, mockUpdate,
  mockMaybeSingle, mockSelectEq, mockSelect,
  mockFrom,
  mockCookieGet, mockCookieSet,
} = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockMaybeSingle = vi.fn();
  const mockSelectEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));
  const mockFrom = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_table: string) => ({
      upsert: mockUpsert,
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
    }),
  );
  const mockCookieGet = vi.fn();
  const mockCookieSet = vi.fn();
  return {
    mockEq, mockInsert, mockUpsert, mockUpdate,
    mockMaybeSingle, mockSelectEq, mockSelect,
    mockFrom,
    mockCookieGet, mockCookieSet,
  };
});

vi.mock('@/app/lib/supabase/server', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet, set: mockCookieSet }),
}));

import { saveEmail } from '@/app/actions/tracking';
import { recordEvent, updateUserEmail } from '@/app/lib/tracking';

describe('recordEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts the user row', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'user-abc' },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  });

  it('inserts a page_view event with utm_source', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'page_view',
      funnel_id: 'quiz-1',
      question_id: '0',
      user_id: 'user-abc',
      utm_source: 'google',
    });
  });

  it('records "Direct" when caller passes "Direct"', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'Direct');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ utm_source: 'Direct' })
    );
  });

  it('records paywall as question_id "paywall"', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', 'paywall', 'google');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ question_id: 'paywall' })
    );
  });

  it('records a buy event with utm_source', async () => {
    await recordEvent('user-abc', 'quiz-1', 'buy', 'paywall', 'facebook');
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'buy',
      funnel_id: 'quiz-1',
      question_id: 'paywall',
      user_id: 'user-abc',
      utm_source: 'facebook',
    });
  });

  it('upserts user_attribution with first_source and last_source set to the same utmSource', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
    expect(mockFrom).toHaveBeenCalledWith('user_attribution');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        first_source: 'google',
        last_source: 'google',
      }),
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  });

  it('always updates last_source and last_seen_at on user_attribution', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'facebook');
    expect(mockFrom).toHaveBeenCalledWith('user_attribution');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_source: 'facebook' }),
    );
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-abc');
  });

  it('uses an ISO timestamp string for first_seen_at and last_seen_at', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
    const upsertCall = mockUpsert.mock.calls.find(
      ([row]) => (row as { user_id?: string }).user_id === 'user-abc',
    );
    expect(upsertCall).toBeDefined();
    const row = upsertCall![0] as Record<string, unknown>;
    expect(typeof row.first_seen_at).toBe('string');
    expect(typeof row.last_seen_at).toBe('string');
    expect(() => new Date(row.first_seen_at as string).toISOString()).not.toThrow();
  });

  it('writes attribution before the events row so the FK is satisfied', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
    const fromCalls = mockFrom.mock.calls.map(([t]) => t);
    const attributionIdx = fromCalls.indexOf('user_attribution');
    const eventsIdx = fromCalls.indexOf('events');
    expect(attributionIdx).toBeGreaterThan(-1);
    expect(eventsIdx).toBeGreaterThan(-1);
    expect(attributionIdx).toBeLessThan(eventsIdx);
  });
});

describe('updateUserEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates email on the users table filtered by id', async () => {
    await updateUserEmail('user-abc', 'test@example.com');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpdate).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(mockEq).toHaveBeenCalledWith('id', 'user-abc');
  });
});

describe('saveEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieGet.mockReturnValue({ value: 'anon-uuid' });
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockEq.mockResolvedValue({ error: null });
  });

  describe('new email', () => {
    it('attaches the email to the current anonymous user', async () => {
      const result = await saveEmail('new@example.com');
      expect(result).toEqual({ ok: true });
      expect(mockUpdate).toHaveBeenCalledWith({ email: 'new@example.com' });
      expect(mockEq).toHaveBeenCalledWith('id', 'anon-uuid');
    });

    it('does not change the userId cookie', async () => {
      await saveEmail('new@example.com');
      expect(mockCookieSet).not.toHaveBeenCalled();
    });
  });

  describe('existing email — returning user', () => {
    beforeEach(() => {
      mockMaybeSingle.mockResolvedValue({ data: { id: 'returning-uuid' } });
    });

    it('switches the userId cookie to the existing user', async () => {
      await saveEmail('returning@example.com');
      expect(mockCookieSet).toHaveBeenCalledWith(
        'userId',
        'returning-uuid',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('does not update the email column', async () => {
      await saveEmail('returning@example.com');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('returns ok: true', async () => {
      expect(await saveEmail('returning@example.com')).toEqual({ ok: true });
    });
  });

  describe('user re-submitting their own email', () => {
    beforeEach(() => {
      // existingUser.id matches the current session — same user
      mockMaybeSingle.mockResolvedValue({ data: { id: 'anon-uuid' } });
    });

    it('updates the email without switching the cookie', async () => {
      await saveEmail('mine@example.com');
      expect(mockCookieSet).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith({ email: 'mine@example.com' });
    });
  });

  describe('validation', () => {
    it('rejects an invalid email format', async () => {
      expect(await saveEmail('not-an-email')).toEqual({ ok: false, error: 'Invalid email' });
    });

    it('rejects an empty string', async () => {
      expect(await saveEmail('')).toEqual({ ok: false, error: 'Invalid email' });
    });
  });

  describe('missing session', () => {
    it('returns an error when the userId cookie is absent', async () => {
      mockCookieGet.mockReturnValue(undefined);
      expect(await saveEmail('user@example.com')).toEqual({ ok: false, error: 'No user session' });
    });
  });

  describe('database errors', () => {
    it('returns a generic error when the email lookup throws', async () => {
      mockMaybeSingle.mockRejectedValue(new Error('connection lost'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await saveEmail('user@example.com')).toEqual({ ok: false, error: 'Failed to save email' });
      consoleSpy.mockRestore();
    });

    it('returns a generic error when the email update throws', async () => {
      mockEq.mockRejectedValue(new Error('unique violation'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await saveEmail('new@example.com')).toEqual({ ok: false, error: 'Failed to save email' });
      consoleSpy.mockRestore();
    });
  });
});
