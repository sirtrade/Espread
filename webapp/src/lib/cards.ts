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
  /** "cloze"/"recall" are multiple-choice; "typed" asks the user to type the
   *  word (Práctica only; the answer is graded on the server). */
  type: "cloze" | "recall" | "typed";
  prompt: string;
  /** the correct option: blanked surface form (cloze) or lemma (recall); empty for typed */
  answer: string;
  options: string[];
  translation: string | null;
  /** the article sentence, shown as after-answer feedback */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
  /** typed cards: the blanked sentence shown as a hint while answering */
  contextHint?: string | null;
  /** SRS ladder rung (Práctica only); absent for post-reading Quiz cards. */
  srsStage?: number;
  /** Opaque server selector for the randomly chosen stored context. */
  contextAddedAt?: number | null;
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

function shuffle<T>(arr: readonly T[], random: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const MIN_OPTIONS = 3;

/** Correct term plus up to count-1 distinct distractors from the pool. */
function buildOptions(correct: string, pool: readonly string[], count: number, random: () => number): string[] {
  const seen = new Set([correct.toLowerCase()]);
  const distractors: string[] = [];
  for (const c of shuffle(pool, random)) {
    if (distractors.length >= count - 1) break;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(c);
  }
  return shuffle([correct, ...distractors], random);
}

function buildCloze(context: string, term: string): string | null {
  const idx = context.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return null;
  return context.slice(0, idx) + "_____" + context.slice(idx + term.length);
}

function leaks(text: string, answer: string): boolean {
  return text.toLowerCase().includes(answer.toLowerCase());
}

function normalizeLeakText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Mirrors server cross-card matching: accent/case-insensitive lexical units. */
export function containsLeakTerm(text: string, term: string): boolean {
  const words = normalizeLeakText(term).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const phrase = words.map(escapeRegex).join(String.raw`\s+`);
  return new RegExp(String.raw`(^|[^\p{L}\p{N}])${phrase}(?=$|[^\p{L}\p{N}])`, "u").test(normalizeLeakText(text));
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

function buildClozeVariant(src: ClientSource, pool: string[], random: () => number): SessionCard | null {
  const answer = src.surface || src.lemma;
  const prompt = src.context ? buildCloze(src.context, answer) : null;
  if (!prompt || leaks(prompt, answer)) return null;
  const options = buildOptions(answer, pool, 4, random);
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

function buildRecallVariant(src: ClientSource, pool: string[], random: () => number): SessionCard | null {
  if (!src.translation || leaks(src.translation, src.lemma)) return null;
  const options = buildOptions(src.lemma, pool, 4, random);
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
export function buildQuizCards(items: readonly ReviewItem[], max = 5, random: () => number = Math.random): SessionCard[] {
  const candidates: Array<SessionCard & { leakAnswers: string[] }> = [];
  for (const item of shuffle(items, random)) {
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
    const cloze = buildClozeVariant(src, pool, random);
    const recall = buildRecallVariant(src, pool, random);
    // Alternate the preferred style by position; fall back to whichever exists.
    const prefer = candidates.length % 2 === 0 ? cloze : recall;
    const card = prefer ?? cloze ?? recall;
    if (card) {
      candidates.push({
        ...card,
        leakAnswers: [item.lemma, item.surface, card.answer].filter(Boolean),
      });
    }
  }

  const selected: Array<SessionCard & { leakAnswers: string[] }> = [];
  for (const original of candidates) {
    if (selected.length >= max) break;
    const candidate = { ...original };
    if (
      selected.some((card) => card.leakAnswers.some((term) => containsLeakTerm(candidate.prompt, term))) ||
      selected.some((card) => candidate.leakAnswers.some((term) => containsLeakTerm(card.prompt, term)))
    ) {
      continue;
    }

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
  return selected.map(({ leakAnswers: _leakAnswers, ...card }) => card);
}

/** Maps a server-built Práctica card into the shared session model. */
export function fromPracticeCard(card: PracticeCard): SessionCard {
  return {
    key: String(card.itemId),
    itemId: card.itemId,
    lemma: card.lemma ?? "",
    type: card.type,
    prompt: card.prompt,
    answer: card.answer,
    options: card.options,
    translation: card.translation,
    context: card.context,
    contextTranslation: card.contextTranslation,
    contextHint: card.contextHint,
    srsStage: card.srsStage,
    contextAddedAt: card.contextAddedAt,
  };
}
