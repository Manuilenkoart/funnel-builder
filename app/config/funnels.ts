import { FunnelConfig, QuestionType } from "../types/funnel";

const TITLE_CSS = "mt-14 text-2xl leading-[1.2]";
export type QuizId = "quiz-1" | "quiz-2";

export const funnelsConfig: Record<QuizId, FunnelConfig> = {
  "quiz-1": {
    screens: [
      {
        title: {
          text: "What is your age?",
          tailwindcss: TITLE_CSS,
        },
        type: QuestionType.rowList,
        componentProps: {
          list: [
            { text: "18-29" },
            { text: "30-39" },
            { text: "40-49" },
            { text: "50+" },
          ],
        },
      },
      {
        title: {
          text: "Where should we send your results?",
          tailwindcss: "mt-4 text-3xl font-extrabold tracking-tight",
        },
        type: QuestionType.email,
        componentProps: {
          subtitle:
            "Enter your email to receive your personalized roadmap and continue.",
          placeholder: "name@example.com",
          buttonText: "Continue to Results",
        },
      },
    ],
  },
  "quiz-2": {
    screens: [
      {
        title: {
          text: "What is your primary goal?",
          tailwindcss: TITLE_CSS,
        },
        type: QuestionType.rowList,
        componentProps: {
          list: [
            { text: "Improve writing" },
            { text: "Boost productivity" },
            { text: "Learn new skills" },
            { text: "Other" },
          ],
        },
      },
      {
        title: {
          text: "Where should we send your results?",
          tailwindcss: "mt-4 text-3xl font-extrabold tracking-tight",
        },
        type: QuestionType.email,
        componentProps: {
          subtitle:
            "Enter your email to receive your personalized roadmap and continue.",
          placeholder: "name@example.com",
          buttonText: "Continue to Results",
        },
      },
    ],
  },
};
