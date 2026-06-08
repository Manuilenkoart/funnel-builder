import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionType } from "@/app/lib/funnels/schema";

const DRAFT = {
  screens: [
    {
      id: "s1",
      title: { text: "Email" },
      type: QuestionType.email,
      componentProps: { buttonText: "Go" },
    },
  ],
};

const results: Record<string, unknown> = {};
const calls: { insert?: unknown; update?: unknown } = {};

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/app/lib/supabase/server", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

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
    insert: (row: unknown) => {
      calls.insert = row;
      return chain;
    },
    update: (row: unknown) => {
      calls.update = row;
      return chain;
    },
  };
  return chain;
}

import { publishVersion } from "@/app/lib/funnels/publish";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(results)) delete results[k];
  delete calls.insert;
  delete calls.update;
  mockFrom.mockImplementation((table: string) => builder(table));
});

describe("publishVersion", () => {
  it("snapshots the draft into version max+1 and repoints current_version_id", async () => {
    mockFrom.mockImplementation((table: string) => {
      const b = builder(table);
      if (table === "funnels") {
        b.single = () =>
          Promise.resolve({ data: { draft_config: DRAFT }, error: null });
      }
      if (table === "funnel_versions") {
        b.maybeSingle = () =>
          Promise.resolve({ data: { version: 4 }, error: null });
        b.single = () =>
          Promise.resolve(
            calls.insert
              ? { data: { id: "new-version-id" }, error: null }
              : { data: { version: 4 }, error: null },
          );
      }
      return b;
    });

    const id = await publishVersion("quiz-1");
    expect(id).toBe("new-version-id");
    expect((calls.insert as { version: number }).version).toBe(5);
    expect(
      (calls.update as { current_version_id: string }).current_version_id,
    ).toBe("new-version-id");
  });

  it("starts at version 1 when no versions exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      const b = builder(table);
      if (table === "funnels") {
        b.single = () =>
          Promise.resolve({ data: { draft_config: DRAFT }, error: null });
      }
      if (table === "funnel_versions") {
        b.maybeSingle = () => Promise.resolve({ data: null, error: null });
        b.single = () =>
          Promise.resolve({ data: { id: "v1-id" }, error: null });
      }
      return b;
    });
    await publishVersion("quiz-1");
    expect((calls.insert as { version: number }).version).toBe(1);
  });

  it("throws on an invalid draft", async () => {
    mockFrom.mockImplementation((table: string) => {
      const b = builder(table);
      if (table === "funnels") {
        b.single = () =>
          Promise.resolve({
            data: { draft_config: { screens: [{ type: "bad" }] } },
            error: null,
          });
      }
      return b;
    });
    await expect(publishVersion("quiz-1")).rejects.toThrow();
  });
});
