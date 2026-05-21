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
            { id: 1, text: "18-29" },
            { id: 2, text: "30-39" },
            { id: 3, text: "40-49" },
            { id: 4, text: "50+" },
          ],
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
            { id: 1, text: "Improve writing" },
            { id: 2, text: "Boost productivity" },
            { id: 3, text: "Learn new skills" },
            { id: 4, text: "Other" },
          ],
        },
      },
    ],
  },
};
