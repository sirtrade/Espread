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
  botQuizzesPerDay: number;
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

/** A single highlight made while reading. `text` is the exact article text,
 *  `sentence` the full sentence it lives in, and `pos` locates the occurrence
 *  (paragraph, sentence, inclusive token range) so highlights restore exactly.
 *  Legacy archived marks may lack `pos` and carry an empty `sentence`. */
export interface Mark {
  text: string;
  sentence: string;
  kind: "word" | "span" | "sentence";
  pos?: { p: number; s: number; t: [number, number] };
}

export interface Session {
  id: number;
  articleId: number;
  marks: Mark[];
  state: "reading" | "reviewed";
  updatedAt: number;
}

export type Pos = "verb" | "noun" | "adj" | "adv" | "phrase" | "other";
export type FreqBand = "top1000" | "top3000" | "top5000" | "rare";

/** A structured vocabulary card returned by the review endpoint. `contextSentence`
 *  is the exact sentence from the article the item was marked in. */
export interface ReviewItem {
  surface: string;
  lemma: string;
  pos: Pos;
  gender: "m" | "f" | null;
  translation: string;
  note: string | null;
  contextTranslation: string | null;
  freqBand: FreqBand;
  distractors: string[];
  contextSentence: string;
}

/** How one of the article's woven bank words fared this reading. */
export interface WovenTerm {
  lemma: string;
  /** clean-exposure streak before this session is completed */
  cleanStreak: number;
  /** the reader marked it again -> its streak resets on completion */
  markedAgain: boolean;
}

export interface ReviewResult {
  items: ReviewItem[];
  wovenTerms: WovenTerm[];
}

/** Legacy `{ words, phrases }` review shape still archived on read articles
 *  (reading history). Kept until the history screen migrates to `ReviewItem`. */
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

export interface LegacyReviewResult {
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

export interface HistoryItem {
  id: number;
  title: string;
  topic: string;
  readAt: number;
  markedWordsCount: number;
  markedSentsCount: number;
}

export interface ReadArticle extends Article {
  readAt: number;
  marks: Mark[];
  reviewResult: LegacyReviewResult | null;
}

export interface Stats {
  articlesRead: number;
  itemsInProgress: number;
  itemsLearned: number;
}

export interface PracticeCard {
  itemId: number;
  term: string;
  isPhrase: boolean;
  translation: string | null;
  type: "cloze" | "recall";
  prompt: string;
  options: string[];
}

export interface SentenceCheckResult {
  ok: boolean;
  feedback: string;
  corrected: string | null;
}
