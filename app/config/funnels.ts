import {
  EmailQuestionConfig,
  FunnelConfig,
  QuestionType,
} from "../types/funnel";

export type QuizId = "quiz-1" | "quiz-2";

const EMAIL_SCREEN: EmailQuestionConfig = {
  title: { text: "Your email" },
  subtitle: { text: "For your daily prompt and to save your progress." },
  type: QuestionType.email,
  componentProps: {
    placeholder: "you@somewhere.com",
    buttonText: "Continue",
  },
};

export const funnelsConfig: Record<QuizId, FunnelConfig> = {
  "quiz-1": {
    screens: [
      {
        title: { text: "How old are you?" },
        subtitle: { text: "We tailor reflections to your stage of life." },
        type: QuestionType.rowList,
        componentProps: {
          list: [
            { text: "18–29" },
            { text: "30–39" },
            { text: "40–49" },
            { text: "50+" },
          ],
        },
      },
      {
        title: { text: "What's bothering you?" },
        subtitle: { text: "Tap to record — we'll listen and reflect back." },
        type: QuestionType.voice,
        componentProps: {
          recordButtonText: "Tap to speak",
          continueButtonText: "Continue",
        },
      },
      EMAIL_SCREEN,
    ],
  },
  "quiz-2": {
    screens: [
      {
        title: { text: "What is your primary goal?" },
        subtitle: {
          text: "We'll personalize your plan around what matters most.",
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
      EMAIL_SCREEN,
    ],
  },
};
