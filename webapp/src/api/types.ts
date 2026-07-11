export type Level = "A2" | "B1" | "B2" | "C1";
export type ExplainLang = "ru" | "en" | "es";
export type BankStatus = "active" | "learned" | "ignored";

export interface Profile {
  id: number;
  tgUserId: number;
  username: string | null;
  level: Level;
  explainLang: ExplainLang;
  timezone: string;
  topics: string[];
  dailyEnabled: boolean;
  dailyTime: string;
  onboarded: boolean;
}

export interface Article {
  id: number;
  title: string;
  body: string;
  topic: string;
  sourceName: string | null;
  sourceUrl: string | null;
  createdAt: number;
}

export interface Session {
  id: number;
  articleId: number;
  markedWords: string[];
  markedSents: string[];
  state: "reading" | "reviewed";
  updatedAt: number;
}

export interface ReviewWord {
  term: string;
  translation: string;
  frequency: "alta" | "baja";
}

export interface ReviewPhrase {
  term: string;
  explanation: string;
  clave: string | null;
}

export interface ReviewResult {
  words: ReviewWord[];
  phrases: ReviewPhrase[];
}

export interface CompleteResult {
  newlyLearned: string[];
  articlesRead: number;
}

export interface BankItem {
  id: number;
  term: string;
  isPhrase: boolean;
  status: BankStatus;
  exposures: number;
  cleanStreak: number;
  translation: string | null;
  firstContext: string | null;
  updatedAt: number;
}

export interface Stats {
  articlesRead: number;
  itemsInProgress: number;
  itemsLearned: number;
}
