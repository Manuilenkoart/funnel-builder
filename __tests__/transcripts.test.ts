import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpsert, mockFrom, mockCookieGet } = vi.hoisted(() => {
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockFrom = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_table: string) => ({ upsert: mockUpsert }),
  );
  const mockCookieGet = vi.fn();
  return { mockUpsert, mockFrom, mockCookieGet };
});

vi.mock("@/app/lib/supabase/server", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
}));

import { saveVoiceTranscript } from "@/app/actions/transcripts";
import { upsertVoiceTranscript } from "@/app/lib/transcripts";

describe("upsertVoiceTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("upserts into voice_transcripts keyed on user/funnel/question", async () => {
    await upsertVoiceTranscript({
      userId: "user-abc",
      funnelId: "quiz-1",
      questionId: "1",
      text: "hello world",
      model: "whisper-tiny.en-bnb4",
    });
    expect(mockFrom).toHaveBeenCalledWith("voice_transcripts");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-abc",
        funnel_id: "quiz-1",
        question_id: "1",
        text: "hello world",
        model: "whisper-tiny.en-bnb4",
      }),
      { onConflict: "user_id,funnel_id,question_id" },
    );
  });

  it("stores null when no model is provided", async () => {
    await upsertVoiceTranscript({
      userId: "user-abc",
      funnelId: "quiz-1",
      questionId: "1",
      text: "hi",
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ model: null }),
      expect.anything(),
    );
  });

  it("throws when the upsert returns an error", async () => {
    mockUpsert.mockResolvedValue({ error: new Error("db down") });
    await expect(
      upsertVoiceTranscript({
        userId: "user-abc",
        funnelId: "quiz-1",
        questionId: "1",
        text: "hi",
      }),
    ).rejects.toThrow("db down");
  });
});

describe("saveVoiceTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    mockCookieGet.mockReturnValue({ value: "user-abc" });
  });

  it("saves a trimmed transcript for the current session", async () => {
    const result = await saveVoiceTranscript({
      funnelId: "quiz-1",
      questionId: "1",
      text: "  spoken words  ",
      model: "whisper-tiny.en-bnb4",
    });
    expect(result).toEqual({ ok: true });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ text: "spoken words", user_id: "user-abc" }),
      expect.anything(),
    );
  });

  describe("validation", () => {
    it("rejects an empty (whitespace-only) transcript", async () => {
      const result = await saveVoiceTranscript({
        funnelId: "quiz-1",
        questionId: "1",
        text: "   ",
      });
      expect(result).toEqual({ ok: false, error: "Empty transcript" });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("rejects a missing funnel or question id", async () => {
      const result = await saveVoiceTranscript({
        funnelId: "",
        questionId: "1",
        text: "hi",
      });
      expect(result).toEqual({
        ok: false,
        error: "Missing funnel or question id",
      });
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe("missing session", () => {
    it("returns an error when the userId cookie is absent", async () => {
      mockCookieGet.mockReturnValue(undefined);
      const result = await saveVoiceTranscript({
        funnelId: "quiz-1",
        questionId: "1",
        text: "hi",
      });
      expect(result).toEqual({ ok: false, error: "No user session" });
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe("database errors", () => {
    it("returns a generic error when the upsert throws", async () => {
      mockUpsert.mockResolvedValue({ error: new Error("unique violation") });
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const result = await saveVoiceTranscript({
        funnelId: "quiz-1",
        questionId: "1",
        text: "hi",
      });
      expect(result).toEqual({ ok: false, error: "Failed to save transcript" });
      consoleSpy.mockRestore();
    });
  });
});
