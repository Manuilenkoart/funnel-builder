
export enum QuestionType {
  rowList = 'rowList',
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
  componentProps?: {
    list?: Array<{ id: number | string; text: string }>;
  };
}

export type QuestionConfig = RowListQuestionConfig;

export interface FunnelConfig {
  screens: QuestionConfig[];
}
