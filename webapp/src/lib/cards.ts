import type { PracticeCard, Pos, ReviewItem } from "../api/types.js";

/**
 * The unified question model shared by both training screens (post-reading
 * Quiz and Práctica). Práctica cards arrive pre-built from the server; Quiz
 * cards are built on the device from the words just accepted into the bank.
 * Either way the QuizSession component renders and grades them identically.
 */
export interface SessionCard {
  /** stable React key + answer routing id */
  key: string;
  /** present for Práctica (server cards); absent for Quiz (routed by lemma) */
  itemId?: number;
  lemma: string;
  type: "cloze" | "recall";
  prompt: string;
  /** the correct option: blanked surface form (cloze) or lemma (recall) */
  answer: string;
  options: string[];
  translation: string | null;
  /** the article sentence, shown as after-answer feedback */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
}

/** POS-aware padding, mirroring the server's last-resort distractor lists. */
const FALLBACK: Record<"noun" | "verb" | "adj", readonly string[]> = {
  noun: ["desarrollo", "esfuerzo", "amenaza", "propuesta", "recurso", "acuerdo", "fuente", "medida", "nivel", "crecimiento"],
  verb: ["desarrollar", "proponer", "alcanzar", "establecer", "impulsar", "señalar", "lograr", "mantener", "generar", "sostener"],
  adj: ["importante", "reciente", "evidente", "complejo", "notable", "frecuente", "amplio", "profundo", "escaso", "sólido"],
};

function fallbackForPos(pos: Pos): readonly string[] {
  if (pos === "verb") return FALLBACK.verb;
  if (pos === "adj") return FALLBACK.adj;
  return FALLBACK.noun;
}

function isPhraseText(text: string): boolean {
  return text.trim().includes(" ");
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const MIN_OPTIONS = 3;

/** Correct term plus up to count-1 distinct distractors from the pool. */
function buildOptions(correct: string, pool: readonly string[], count = 4): string[] {
  const seen = new Set([correct.toLowerCase()]);
  const distractors: string[] = [];
  for (const c of shuffle(pool)) {
    if (distractors.length >= count - 1) break;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(c);
  }
  return shuffle([correct, ...distractors]);
}

function buildCloze(context: string, term: string): string | null {
  const idx = context.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return null;
  return context.slice(0, idx) + "_____" + context.slice(idx + term.length);
}

function leaks(text: string, answer: string): boolean {
  return text.toLowerCase().includes(answer.toLowerCase());
}

interface ClientSource {
  lemma: string;
  isPhrase: boolean;
  pos: Pos;
  translation: string;
  surface: string;
  context: string;
  contextTranslation: string | null;
  storedDistractors: readonly string[];
  poolLemmas: readonly string[];
}

function distractorPool(src: ClientSource): string[] {
  const base = [...src.storedDistractors, ...src.poolLemmas];
  if (src.isPhrase) return base.filter(isPhraseText);
  return [...base.filter((w) => !isPhraseText(w)), ...fallbackForPos(src.pos)];
}

function buildClozeVariant(src: ClientSource, pool: string[]): SessionCard | null {
  const answer = src.surface || src.lemma;
  const prompt = src.context ? buildCloze(src.context, answer) : null;
  if (!prompt || leaks(prompt, answer)) return null;
  const options = buildOptions(answer, pool);
  if (options.length < MIN_OPTIONS) return null;
  return {
    key: src.lemma,
    lemma: src.lemma,
    type: "cloze",
    prompt,
    answer,
    options,
    translation: src.translation,
    context: src.context,
    contextTranslation: src.contextTranslation,
  };
}

function buildRecallVariant(src: ClientSource, pool: string[]): SessionCard | null {
  if (!src.translation || leaks(src.translation, src.lemma)) return null;
  const options = buildOptions(src.lemma, pool);
  if (options.length < MIN_OPTIONS) return null;
  return {
    key: src.lemma,
    lemma: src.lemma,
    type: "recall",
    prompt: src.translation,
    answer: src.lemma,
    options,
    translation: src.translation,
    context: src.context,
    contextTranslation: src.contextTranslation,
  };
}

/**
 * Builds the post-reading quiz from the words just accepted into the bank.
 * Alternates cloze/recall for variety; leak protection degrades a leaking
 * recall into a cloze and drops any word that can't become a safe card.
 */
export function buildQuizCards(items: readonly ReviewItem[], max = 5): SessionCard[] {
  const cards: SessionCard[] = [];
  for (const item of shuffle(items)) {
    if (cards.length >= max) break;
    const isPhrase = item.pos === "phrase";
    const src: ClientSource = {
      lemma: item.lemma,
      isPhrase,
      pos: item.pos,
      translation: item.translation,
      surface: item.surface,
      context: item.contextSentence,
      contextTranslation: item.contextTranslation,
      storedDistractors: item.distractors,
      // Other accepted words of the same shape make plausible, non-mixed decoys.
      poolLemmas: items
        .filter((o) => o.lemma !== item.lemma && (o.pos === "phrase") === isPhrase)
        .map((o) => o.lemma),
    };
    const pool = distractorPool(src);
    const cloze = buildClozeVariant(src, pool);
    const recall = buildRecallVariant(src, pool);
    // Alternate the preferred style by position; fall back to whichever exists.
    const prefer = cards.length % 2 === 0 ? cloze : recall;
    const card = prefer ?? cloze ?? recall;
    if (card) cards.push(card);
  }
  return cards;
}

/** Maps a server-built Práctica card into the shared session model. */
export function fromPracticeCard(card: PracticeCard): SessionCard {
  return {
    key: String(card.itemId),
    itemId: card.itemId,
    lemma: card.lemma,
    type: card.type,
    prompt: card.prompt,
    answer: card.answer,
    options: card.options,
    translation: card.translation,
    context: card.context,
    contextTranslation: card.contextTranslation,
  };
}
