import type { ThemeId } from "../lib/theme.js";
import type { FontSizeId } from "../lib/fontSize.js";

export type Level = "A2" | "B1" | "B2" | "C1";
export type ExplainLang = "ru" | "en" | "es";
export type BankStatus = "active" | "learned" | "ignored" | "queued";

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

/** Grammatical-mood analysis attached to a card when the marked form is a
 *  subjunctive verb. `label` is the Spanish tense name ("subjuntivo presente");
 *  `explanation` says, in the explain language, why the subjunctive is used. */
export interface GrammarNote {
  label: string;
  explanation: string;
}

/** A structured vocabulary card returned by the review endpoint. `contextSentence`
 *  is the exact sentence from the article the item was marked in. */
export interface ReviewItem {
  surface: string;
  lemma: string;
  pos: Pos;
  gender: "m" | "f" | null;
  translation: string;
  note: string | null;
  grammar: GrammarNote | null;
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
  /** Optional: archived reviews from before the subjunctive analysis feature
   *  won't carry it. */
  grammar?: GrammarNote | null;
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
}

export interface PracticeCard {
  itemId: number;
  lemma: string;
  isPhrase: boolean;
  translation: string | null;
  type: "cloze" | "recall";
  prompt: string;
  /** the correct option: blanked surface form (cloze) or lemma (recall) */
  answer: string;
  options: string[];
  /** the article sentence, shown as after-answer feedback */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
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
}

export interface SentenceCheckResult {
  ok: boolean;
  feedback: string;
  corrected: string | null;
}
