import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEq, mockInsert, mockUpsert, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({
    upsert: mockUpsert,
    insert: mockInsert,
    update: mockUpdate,
  }));
  return { mockEq, mockInsert, mockUpsert, mockUpdate, mockFrom };
});

vi.mock('@/app/lib/supabase/server', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

import { recordEvent, updateUserEmail } from '@/app/lib/tracking';

describe('recordPageView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts the user row', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'user-abc' },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  });

  it('inserts a page_view event with correct fields', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', '0');
    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'page_view',
      funnel_id: 'quiz-1',
      question_id: '0',
      user_id: 'user-abc',
    });
  });

  it('records paywall as question_id "paywall"', async () => {
    await recordEvent('user-abc', 'quiz-1', 'page_view', 'paywall');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ question_id: 'paywall' })
    );
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
