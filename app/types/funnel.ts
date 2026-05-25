export enum QuestionType {
  rowList = "rowList",
  email = "email",
  voice = "voice",
}

export interface QuestionTitleConfig {
  text: string;
  tailwindcss?: string;
}

export interface BaseQuestionConfig {
  title: QuestionTitleConfig;
  subtitle?: QuestionTitleConfig;
}

export interface RowListQuestionConfig extends BaseQuestionConfig {
  type: QuestionType.rowList;
  componentProps: {
    list: { text: string }[];
  };
}

export interface EmailQuestionConfig extends BaseQuestionConfig {
  type: QuestionType.email;
  componentProps: {
    placeholder?: string;
    buttonText: string;
  };
}

export interface VoiceQuestionConfig extends BaseQuestionConfig {
  type: QuestionType.voice;
  componentProps: {
    recordButtonText: string;
    continueButtonText: string;
  };
}

export type QuestionConfig =
  | RowListQuestionConfig
  | EmailQuestionConfig
  | VoiceQuestionConfig;

export interface FunnelConfig {
  screens: QuestionConfig[];
}
