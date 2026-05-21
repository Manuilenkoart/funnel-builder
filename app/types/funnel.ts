export enum QuestionType {
  rowList = "rowList",
  email = "email",
}

export interface QuestionTitleConfig {
  text: string;
  tailwindcss?: string;
}

export interface BaseQuestionConfig {
  title: QuestionTitleConfig;
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
    subtitle?: string;
    buttonText: string;
  };
}

export type QuestionConfig = RowListQuestionConfig | EmailQuestionConfig;

export interface FunnelConfig {
  screens: QuestionConfig[];
}
