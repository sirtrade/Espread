import type { ThemeId } from "../lib/theme.js";
import type { FontSizeId } from "../lib/fontSize.js";

export type Level = "A2" | "B1" | "B2" | "C1" | "C2";
export type ExplainLang = "ru" | "en" | "es";
export type BankStatus = "active" | "learned" | "ignored" | "queued";

export interface LevelSuggestion {
  direction: "up" | "down";
  targetLevel: Level;
}

export interface Profile {
  id: number;
  tgUserId: number;
  username: string | null;
  level: Level;
  explainLang: ExplainLang;
  timezone: string;
  /** display preferences stored on the profile; null = client default */
  theme: ThemeId | null;
  fontSize: FontSizeId | null;
  topics: string[];
  dailyEnabled: boolean;
  dailyTime: string;
  botQuizzesPerDay: number;
  /** cap on words in study at once (0 = no limit) */
  activePoolLimit: number;
  /** cards requested per Práctica session (server clamps 1-30) */
  practiceSize: number;
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
  /** SRS ladder rung before this session is completed */
  srsStage: number;
  /** the reader marked it again -> its schedule resets on completion */
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

/** New archived review shape (`{ items }`) saved on articles read after the
 *  lemma refactor. It's a `ReviewItem` without the view-only `contextSentence`
 *  (the sentence isn't stored, so history renders the card without context). */
export interface ArchivedReviewItem {
  surface: string;
  lemma: string;
  pos: Pos;
  gender: "m" | "f" | null;
  translation: string;
  note: string | null;
  contextTranslation: string | null;
  freqBand: FreqBand;
  distractors: string[];
}

export interface ArchivedReviewResult {
  items: ArchivedReviewItem[];
}

/** Distinguishes the two archived formats: the new one carries `items`, the
 *  legacy one carries `words`/`phrases`. Narrows a possibly-null value. */
export function isArchivedReviewResult(
  r: LegacyReviewResult | ArchivedReviewResult | null,
): r is ArchivedReviewResult {
  return r != null && "items" in r;
}

export interface CompleteResult {
  /** lemmas parked in the queue because the active pool was full */
  queued: string[];
  articlesRead: number;
  levelSuggestion: LevelSuggestion | null;
}

export interface BankItem {
  id: number;
  lemma: string;
  surfaceForm: string | null;
  isPhrase: boolean;
  pos: Pos;
  gender: "m" | "f" | null;
  status: BankStatus;
  exposures: number;
  translation: string | null;
  note: string | null;
  firstContext: string | null;
  contextTranslation: string | null;
  contexts?: Array<{
    sentence: string;
    translation: string | null;
    surfaceForm: string;
    articleId: number | null;
    addedAt: number;
  }>;
  distractors: string[] | null;
  freqBand: FreqBand | null;
  updatedAt: number;
  /** SRS repetition timer, emitted by `serializeBankItem`. Optional because
   *  a word may not have been scheduled yet (`nextDueAt` null). */
  nextDueAt?: number | null;
  srsStage?: number;
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
  reviewResult: LegacyReviewResult | ArchivedReviewResult | null;
}

export interface Stats {
  articlesRead: number;
  itemsInProgress: number;
  itemsLearned: number;
  itemsQueued: number;
  /** cap on words in study at once (0 = no limit) */
  activePoolLimit: number;
  levelSuggestion: LevelSuggestion | null;
  currentStreak: number;
  weeklyProgress: Array<{
    /** Monday in the user's local calendar, YYYY-MM-DD */
    weekStart: string;
    articlesRead: number;
    wordsLearned: number;
  }>;
}

export type KnownWordSource = "learned" | "reading" | "manual";

export interface KnownWord {
  lemma: string;
  source: KnownWordSource;
  encounters: number;
  firstSeenAt: number;
  lastSeenAt: number;
  knownSince: number;
}

export interface VocabularyStats {
  total: number;
  bySource: Record<KnownWordSource, number>;
  weekly: Array<{ weekStart: number; added: number }>;
  coverage: {
    version: string;
    ranges: Array<{ from: number; to: number; known: number; total: number }>;
  };
}

/** How a typed-recall answer was graded (mirrors the server's `TypedVerdict`). */
export type TypedVerdict = "exact" | "spelling" | "wrong";

export interface PracticeCard {
  itemId: number;
  /** Null for typed cards until the answer endpoint reveals the proper form. */
  lemma: string | null;
  isPhrase: boolean;
  /** SRS ladder rung of the word; drives whether the free-writing exercise is
   *  offered upfront (upper rungs) or behind a link. */
  srsStage: number;
  translation: string | null;
  /** "cloze"/"recall" are multiple-choice; "typed" asks the user to type the
   *  word (graded on the server, so `answer` is empty and `options` is `[]`). */
  type: "cloze" | "recall" | "typed";
  prompt: string;
  /** the correct option: blanked surface form (cloze) or lemma (recall); empty for typed */
  answer: string;
  options: string[];
  /** article sentence; null for typed cards to keep accepted forms server-side */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
  /** typed cards: the blanked sentence shown as a hint while answering (null for MC) */
  contextHint: string | null;
  /** Opaque selector used to preserve the chosen typed-card feedback. */
  contextAddedAt: number | null;
}

/** New SRS state returned after a practice/quiz answer, used to build the
 *  end-of-session summary (which words advanced or reset). */
export interface PracticeAnswerResult {
  ok: true;
  srsStage: number;
  nextDueAt: number;
  status: BankStatus;
  /** the word climbed a rung this answer (within the daily cap) */
  advanced: boolean;
  /** typed answers only: the server's grading verdict */
  verdict?: TypedVerdict;
  /** typed answers only: whether the server judged the answer correct */
  correct?: boolean;
  /** typed answers only: the proper form to show as feedback */
  answer?: string;
  /** typed answers only: revealed after grading for corrective feedback */
  context?: string | null;
  contextTranslation?: string | null;
}

export interface SentenceCheckResult {
  ok: boolean;
  feedback: string;
  corrected: string | null;
}
