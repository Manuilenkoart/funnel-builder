import { z } from "zod";

export enum QuestionType {
  rowList = "rowList",
  email = "email",
  voice = "voice",
}

const titleSchema = z.object({
  text: z.string(),
  tailwindcss: z.string().optional(),
});

const baseScreen = {
  id: z.string().optional(),
  title: titleSchema,
  subtitle: titleSchema.optional(),
};

const rowListScreenSchema = z.object({
  ...baseScreen,
  type: z.literal(QuestionType.rowList),
  componentProps: z.object({
    list: z.array(z.object({ text: z.string() })),
  }),
});

const emailScreenSchema = z.object({
  ...baseScreen,
  type: z.literal(QuestionType.email),
  componentProps: z.object({
    placeholder: z.string().optional(),
    buttonText: z.string(),
  }),
});

const voiceScreenSchema = z.object({
  ...baseScreen,
  type: z.literal(QuestionType.voice),
  componentProps: z.object({
    recordButtonText: z.string(),
    continueButtonText: z.string(),
  }),
});

export const questionConfigSchema = z.discriminatedUnion("type", [
  rowListScreenSchema,
  emailScreenSchema,
  voiceScreenSchema,
]);

export const funnelConfigSchema = z.object({
  screens: z.array(questionConfigSchema),
});

export type QuestionTitleConfig = z.infer<typeof titleSchema>;
export type RowListQuestionConfig = z.infer<typeof rowListScreenSchema>;
export type EmailQuestionConfig = z.infer<typeof emailScreenSchema>;
export type VoiceQuestionConfig = z.infer<typeof voiceScreenSchema>;
export type QuestionConfig = z.infer<typeof questionConfigSchema>;
export type FunnelConfig = z.infer<typeof funnelConfigSchema>;

export function parseFunnelConfig(data: unknown): FunnelConfig {
  return funnelConfigSchema.parse(data);
}

export function ensureScreenIds(config: FunnelConfig): FunnelConfig {
  return {
    ...config,
    screens: config.screens.map((s) =>
      s.id ? s : { ...s, id: crypto.randomUUID() },
    ),
  };
}
