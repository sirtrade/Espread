/**
 * Practice card construction (cloze / recall multiple-choice) over bank items.
 * The spaced-repetition schedule that decides WHEN a word is drilled or woven
 * lives in ./srs.ts and is applied in the bank repository; this module only
 * turns a due item into a safe, answerable card.
 */

import { type PartOfSpeech } from "./bank.js";
import { buildTypedQuizCard, TYPED_QUIZ_MIN_STAGE } from "./typedQuiz.js";

/**
 * POS-aware padding words, used only as a last resort when the user's bank
 * can't supply enough same-part-of-speech distractors. Kept per-POS so a noun
 * question never offers a verb as a decoy. Phrase cards get no fallback — a
 * phrase must be drilled against other phrases or skipped entirely.
 */
export const FALLBACK_DISTRACTORS: Record<"noun" | "verb" | "adj", readonly string[]> = {
  noun: [
    "desarrollo",
    "esfuerzo",
    "amenaza",
    "propuesta",
    "recurso",
    "acuerdo",
    "fuente",
    "medida",
    "nivel",
    "crecimiento",
    "resultado",
    "proceso",
    "decisión",
    "cambio",
    "objetivo",
    "informe",
    "entorno",
    "debate",
    "impacto",
    "desafío",
    "estrategia",
    "tendencia",
    "iniciativa",
    "avance",
    "criterio",
    "conjunto",
    "alcance",
    "riesgo",
    "enfoque",
    "contexto",
  ],
  verb: [
    "desarrollar",
    "proponer",
    "alcanzar",
    "establecer",
    "impulsar",
    "señalar",
    "lograr",
    "mantener",
    "generar",
    "sostener",
    "considerar",
    "analizar",
    "mejorar",
    "reducir",
    "aumentar",
    "aplicar",
    "evaluar",
    "permitir",
    "evitar",
    "reconocer",
    "observar",
    "definir",
    "asumir",
    "abordar",
    "destacar",
    "avanzar",
    "conservar",
    "determinar",
    "plantear",
    "favorecer",
  ],
  adj: [
    "importante",
    "reciente",
    "evidente",
    "complejo",
    "notable",
    "frecuente",
    "amplio",
    "profundo",
    "escaso",
    "sólido",
    "relevante",
    "general",
    "principal",
    "actual",
    "posible",
    "distinto",
    "adecuado",
    "significativo",
    "específico",
    "común",
    "estable",
    "positivo",
    "negativo",
    "necesario",
    "disponible",
    "fundamental",
    "habitual",
    "diverso",
    "concreto",
    "eficaz",
  ],
};

/** Keep fallback varied without letting it swamp higher-priority sources. */
export const FALLBACK_SAMPLE_SIZE = 8;

/** The fallback list for a POS. Nouns/adverbs/other fall back to the noun list. */
function fallbackForPos(pos: PartOfSpeech | null): readonly string[] {
  if (pos === "verb") return FALLBACK_DISTRACTORS.verb;
  if (pos === "adj") return FALLBACK_DISTRACTORS.adj;
  return FALLBACK_DISTRACTORS.noun;
}

/** Random last-resort slice; injectable randomness keeps tests reproducible. */
export function sampleFallbackDistractors(
  pos: PartOfSpeech | null,
  random: () => number = Math.random,
  count = FALLBACK_SAMPLE_SIZE,
): string[] {
  return shuffleInPlace([...fallbackForPos(pos)], random).slice(0, count);
}

/** A multi-word answer/option (used to keep phrases and single words apart). */
export function isPhraseText(text: string): boolean {
  return text.trim().includes(" ");
}

function shuffleInPlace<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Fisher-Yates shuffle with injectable randomness for deterministic tests. */
export function shufflePracticeCandidates<T>(items: readonly T[], random: () => number = Math.random): T[] {
  return shuffleInPlace([...items], random);
}

/** Lowercase and remove accents while retaining spaces for phrase matching. */
function normalizeLeakText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * True when a word or multi-word phrase occurs as a complete lexical unit.
 * Matching is case/accent-insensitive; phrase whitespace may vary.
 */
export function containsLeakTerm(text: string, term: string): boolean {
  const words = normalizeLeakText(term).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const phrase = words.map(escapeRegex).join(String.raw`\s+`);
  return new RegExp(String.raw`(^|[^\p{L}\p{N}])${phrase}(?=$|[^\p{L}\p{N}])`, "u").test(normalizeLeakText(text));
}

export interface CrossCardLeakSource {
  prompt: string;
  context: string | null;
  contextHint: string | null;
  /** All forms which count as this card's answer; never serialized to clients. */
  leakAnswers: readonly string[];
}

/**
 * Greedily builds a safe batch in candidate order.
 *
 * Prompt conflicts drop the later candidate so a question remains meaningful.
 * Context/contextHint conflicts are sanitized to null on either card. Continuing
 * through the oversampled candidates refills dropped cards where possible.
 */
export function protectCrossCardLeaks<T extends CrossCardLeakSource>(candidates: readonly T[], limit: number): T[] {
  const selected: T[] = [];

  for (const original of candidates) {
    if (selected.length >= limit) break;
    const candidate = { ...original };

    const leaksSelectedPrompt = selected.some((card) =>
      card.leakAnswers.some((term) => containsLeakTerm(candidate.prompt, term)),
    );
    const leaksExistingPrompt = selected.some((card) =>
      candidate.leakAnswers.some((term) => containsLeakTerm(card.prompt, term)),
    );
    if (leaksSelectedPrompt || leaksExistingPrompt) continue;

    if (
      candidate.context &&
      selected.some((card) => card.leakAnswers.some((term) => containsLeakTerm(candidate.context!, term)))
    ) {
      candidate.context = null;
    }
    if (
      candidate.contextHint &&
      selected.some((card) => card.leakAnswers.some((term) => containsLeakTerm(candidate.contextHint!, term)))
    ) {
      candidate.contextHint = null;
    }

    for (let i = 0; i < selected.length; i++) {
      const card = selected[i]!;
      const context =
        card.context && candidate.leakAnswers.some((term) => containsLeakTerm(card.context!, term))
          ? null
          : card.context;
      const contextHint =
        card.contextHint && candidate.leakAnswers.some((term) => containsLeakTerm(card.contextHint!, term))
          ? null
          : card.contextHint;
      if (context !== card.context || contextHint !== card.contextHint) {
        selected[i] = { ...card, context, contextHint };
      }
    }

    selected.push(candidate);
  }
  return selected;
}

/**
 * Builds a shuffled multiple-choice option list: the correct term plus up to
 * `count - 1` distinct distractors drawn from `pool` (already ordered by
 * priority by the caller). No built-in padding — the caller composes the pool,
 * including any POS-aware fallback, so this never mixes phrases with words or
 * crosses parts of speech.
 */
export function buildOptions(
  correct: string,
  pool: readonly string[],
  count = 4,
  random: () => number = Math.random,
): string[] {
  const seen = new Set([correct.toLowerCase()]);
  const distractors: string[] = [];

  for (const c of pool) {
    if (distractors.length >= count - 1) break;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(c);
  }

  return shuffleInPlace([correct, ...distractors], random);
}

/**
 * Replaces the term inside its context sentence with a blank, for cloze
 * cards. Case-insensitive; returns null when the term does not occur in the
 * context (caller falls back to a translation prompt).
 */
export function buildCloze(context: string, term: string): string | null {
  const idx = context.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return null;
  return context.slice(0, idx) + "_____" + context.slice(idx + term.length);
}

/**
 * Cloze over the stored context: the blank hides the surface form actually
 * used in the sentence ("perfila"), falling back to the lemma. Returns the
 * blanked prompt plus the answer that fills it, or null when neither form
 * occurs in the context.
 */
export function buildClozeCard(
  context: string | null,
  lemma: string,
  surfaceForm: string | null,
): { prompt: string; answer: string } | null {
  if (!context) return null;
  for (const answer of [surfaceForm, lemma]) {
    if (!answer) continue;
    const prompt = buildCloze(context, answer);
    if (prompt) return { prompt, answer };
  }
  return null;
}

/** Same-POS distractors stored on the item (JSON), falling back gracefully. */
export function parseStoredDistractors(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string" && d.length > 0) : [];
  } catch {
    return [];
  }
}

/** A usable multiple-choice card always has one answer plus 3 distractors. */
const MIN_OPTIONS = 4;

/** Everything needed to build a practice card, independent of the DB row shape. */
export interface CardSource {
  lemma: string;
  isPhrase: boolean;
  translation: string | null;
  firstContext: string | null;
  surfaceForm: string | null;
  contextTranslation: string | null;
  pos: PartOfSpeech | null;
  /** same-POS distractors stored on the item */
  storedDistractors: readonly string[];
  /** other bank lemmas of the same POS, for padding */
  poolLemmas: readonly string[];
}

export type CardType = "cloze" | "recall";

export interface BuiltCard {
  type: CardType;
  prompt: string;
  /** the correct option: the blanked surface form (cloze) or the lemma (recall) */
  answer: string;
  options: string[];
  translation: string | null;
  /** the article sentence, for after-answer feedback */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
}

/** Composes the priority pool, keeping phrases and words apart. */
function distractorPool(src: CardSource, random: () => number): string[] {
  const base = [...src.storedDistractors, ...src.poolLemmas];
  if (src.isPhrase) {
    // Phrase cards drill only against other phrases (no single words, no fallback).
    return base.filter(isPhraseText);
  }
  return [...base.filter((w) => !isPhraseText(w)), ...sampleFallbackDistractors(src.pos, random)];
}

/** Whether `answer` occurs anywhere inside `text` (case-insensitive). */
function leaks(text: string, answer: string): boolean {
  return text.toLowerCase().includes(answer.toLowerCase());
}

/** Cloze variant, or null when there is no usable context or the answer would
 *  still be visible in the prompt after blanking (leak). */
function buildClozeVariant(src: CardSource, pool: string[], random: () => number): BuiltCard | null {
  const cloze = buildClozeCard(src.firstContext, src.lemma, src.surfaceForm);
  if (!cloze) return null;
  // The blank replaces the first occurrence; a repeat elsewhere would leak it.
  if (leaks(cloze.prompt, cloze.answer)) return null;
  const options = buildOptions(cloze.answer, pool, 4, random);
  if (options.length < MIN_OPTIONS) return null;
  return {
    type: "cloze",
    prompt: cloze.prompt,
    answer: cloze.answer,
    options,
    translation: src.translation,
    context: src.firstContext,
    contextTranslation: src.contextTranslation,
  };
}

/** Recall variant, or null when there is no translation or the lemma leaks
 *  into the translation prompt (e.g. a translation that echoes the word). */
function buildRecallVariant(src: CardSource, pool: string[], random: () => number): BuiltCard | null {
  if (!src.translation) return null;
  if (leaks(src.translation, src.lemma)) return null;
  const options = buildOptions(src.lemma, pool, 4, random);
  if (options.length < MIN_OPTIONS) return null;
  return {
    type: "recall",
    prompt: src.translation,
    answer: src.lemma,
    options,
    translation: src.translation,
    context: src.firstContext,
    contextTranslation: src.contextTranslation,
  };
}

/**
 * Builds one practice card for an item, or null when neither a cloze nor a
 * recall card can be made safely (missing data, unavoidable answer leak, or —
 * for phrases — too few phrase distractors).
 *
 * `prefer` alternates the question style; leak protection degrades a leaking
 * recall into a cloze (and skips a leaking cloze), so the returned card always
 * satisfies: the correct answer never appears in the prompt.
 */
export function buildCard(src: CardSource, prefer: CardType = "cloze", random: () => number = Math.random): BuiltCard | null {
  const pool = distractorPool(src, random);
  const cloze = buildClozeVariant(src, pool, random);
  const recall = buildRecallVariant(src, pool, random);
  const [first, second] = prefer === "cloze" ? [cloze, recall] : [recall, cloze];
  return first ?? second ?? null;
}

/** The card kinds a practice queue can serve: multiple-choice (cloze/recall) or
 *  a typed-recall prompt the user answers by typing the word. */
export type QueueCardType = CardType | "typed";

/** A practice-queue card. For `typed` cards `answer` is empty and `options` is
 *  `[]`: the answer is graded on the server (the client is never told it), and
 *  `contextHint` carries the blanked sentence shown while answering. */
export interface QueueCard {
  type: QueueCardType;
  prompt: string;
  answer: string;
  options: string[];
  translation: string | null;
  context: string | null;
  contextTranslation: string | null;
  /** blanked context sentence shown as a typed-card hint; null for MC cards */
  contextHint: string | null;
}

/** A due item plus its SRS rung, which decides typed vs multiple-choice. */
export interface QueueItemSource extends CardSource {
  srsStage: number;
}

/**
 * Chooses the practice card for one due item. From `TYPED_QUIZ_MIN_STAGE` up the
 * word is asked as a typed-recall card (produce the Spanish word from its
 * translation — stronger retrieval than recognition); below that rung, or when a
 * safe typed card can't be built (no translation, or the translation echoes the
 * answer), it falls back to the multiple-choice cloze/recall card. Returns null
 * when no safe card of any kind can be made.
 */
export function buildQueueCard(
  src: QueueItemSource,
  prefer: CardType = "cloze",
  random: () => number = Math.random,
): QueueCard | null {
  if (src.srsStage >= TYPED_QUIZ_MIN_STAGE) {
    const typed = buildTypedQuizCard({
      lemma: src.lemma,
      translation: src.translation,
      firstContext: src.firstContext,
      surfaceForm: src.surfaceForm,
    });
    if (typed) {
      return {
        type: "typed",
        prompt: typed.prompt,
        answer: "",
        options: [],
        translation: src.translation,
        context: src.firstContext,
        contextTranslation: src.contextTranslation,
        contextHint: typed.contextHint,
      };
    }
  }
  const mc = buildCard(src, prefer, random);
  if (!mc) return null;
  return { ...mc, contextHint: null };
}
