import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionType } from "@/app/lib/funnels/schema";

// unstable_cache → pass-through so we test the underlying fetch directly.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const VALID_CONFIG = {
  screens: [
    {
      id: "s1",
      title: { text: "Age" },
      type: QuestionType.rowList,
      componentProps: { list: [{ text: "18-29" }] },
    },
  ],
};

// Per-table canned results, set by each test.
const results: Record<string, unknown> = {};

const { mockFrom, mockUpsert } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockUpsert: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/app/lib/supabase/server", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

// Chainable query builder: every .eq/.select/.order/.limit returns `this`;
// terminals (.maybeSingle/.single) resolve the table's canned result.
function builder(table: string) {
  const resolve = () =>
    Promise.resolve(results[table] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: resolve,
    single: resolve,
    upsert: mockUpsert,
  };
  return chain;
}

import { getAssignedVersionId, getFunnelForUser } from "@/app/lib/funnels/read";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(results)) delete results[k];
  mockFrom.mockImplementation((table: string) => builder(table));
  mockUpsert.mockResolvedValue({ error: null });
});

describe("getAssignedVersionId", () => {
  it("returns the pinned version when an assignment exists", async () => {
    results.funnel_assignments = {
      data: { version_id: "v-pinned" },
      error: null,
    };
    expect(await getAssignedVersionId("u1", "quiz-1")).toBe("v-pinned");
  });

  it("returns null when no assignment exists", async () => {
    results.funnel_assignments = { data: null, error: null };
    expect(await getAssignedVersionId("u1", "quiz-1")).toBeNull();
  });
});

describe("getFunnelForUser", () => {
  it("reuses an existing pin even if the funnel moved to a newer version", async () => {
    results.funnel_assignments = { data: { version_id: "v1" }, error: null };
    results.funnel_versions = { data: { config: VALID_CONFIG }, error: null };

    const out = await getFunnelForUser("quiz-1", "u1");
    expect(out?.versionId).toBe("v1");
    expect(out?.config.screens).toHaveLength(1);
    expect(mockUpsert).not.toHaveBeenCalled(); // no new assignment created
  });

  it("pins the current version on first visit", async () => {
    // First assignment read: none. funnel has a current version. Re-read: pinned.
    results.funnel_assignments = { data: null, error: null };
    results.funnels = { data: { current_version_id: "v2" }, error: null };
    results.funnel_versions = { data: { config: VALID_CONFIG }, error: null };

    const out = await getFunnelForUser("quiz-1", "u1");
    expect(out?.versionId).toBe("v2");
    // upsert called twice: users row + funnel_assignments row.
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("returns null for an unknown / unpublished funnel", async () => {
    results.funnel_assignments = { data: null, error: null };
    results.funnels = { data: null, error: null };
    expect(await getFunnelForUser("nope", "u1")).toBeNull();
  });
});
