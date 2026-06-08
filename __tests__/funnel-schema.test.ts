import { describe, expect, it } from "vitest";

import {
  ensureScreenIds,
  parseFunnelConfig,
  QuestionType,
} from "@/app/lib/funnels/schema";

describe("parseFunnelConfig", () => {
  it("accepts a valid rowList + email + voice config", () => {
    const cfg = {
      screens: [
        {
          title: { text: "Age?" },
          type: QuestionType.rowList,
          componentProps: { list: [{ text: "18-29" }] },
        },
        {
          title: { text: "Email" },
          type: QuestionType.email,
          componentProps: { buttonText: "Continue" },
        },
        {
          title: { text: "Speak" },
          type: QuestionType.voice,
          componentProps: {
            recordButtonText: "Hold",
            continueButtonText: "Next",
          },
        },
      ],
    };
    expect(parseFunnelConfig(cfg).screens).toHaveLength(3);
  });

  it("rejects an unknown question type", () => {
    expect(() =>
      parseFunnelConfig({
        screens: [{ title: { text: "x" }, type: "slider" }],
      }),
    ).toThrow();
  });

  it("rejects a rowList screen missing componentProps.list", () => {
    expect(() =>
      parseFunnelConfig({
        screens: [
          {
            title: { text: "x" },
            type: QuestionType.rowList,
            componentProps: {},
          },
        ],
      }),
    ).toThrow();
  });
});

describe("ensureScreenIds", () => {
  it("fills missing screen ids and preserves existing ones", () => {
    const out = ensureScreenIds({
      screens: [
        {
          title: { text: "a" },
          type: QuestionType.email,
          componentProps: { buttonText: "Go" },
        },
        {
          id: "keep",
          title: { text: "b" },
          type: QuestionType.email,
          componentProps: { buttonText: "Go" },
        },
      ],
    });
    expect(out.screens[0].id).toEqual(expect.any(String));
    expect(out.screens[0].id).not.toEqual("");
    expect(out.screens[1].id).toBe("keep");
  });
});
