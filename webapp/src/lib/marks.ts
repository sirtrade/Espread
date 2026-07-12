import type { Mark } from "../api/types.js";
import type { InlineToken, Paragraph } from "./tokenize.js";

/** A mark located by its occurrence in the tokenized article: paragraph p,
 *  sentence s, and an inclusive token range t = [first, last]. This is the
 *  in-memory shape the reader works with; it maps 1:1 to the API `Mark.pos`. */
export interface MarkPos {
  kind: Mark["kind"];
  p: number;
  s: number;
  t: [number, number];
}

/** True when no *word* token sits strictly between indices i and j, so the two
 *  words are neighbours across any punctuation/whitespace tokens between them. */
export function noWordBetween(tokens: InlineToken[], i: number, j: number): boolean {
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  for (let k = lo + 1; k < hi; k++) {
    if (tokens[k].type === "word") return false;
  }
  return true;
}

/** Exact article text of an inclusive token range, joined as it appears. */
export function rangeText(tokens: InlineToken[], t0: number, t1: number): string {
  let out = "";
  for (let k = t0; k <= t1; k++) out += tokens[k]?.text ?? "";
  return out;
}

/** The word-token range spanning a whole sentence (first..last word token). */
export function sentenceWordRange(tokens: InlineToken[]): [number, number] {
  let first = -1;
  let last = -1;
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].type === "word") {
      if (first === -1) first = k;
      last = k;
    }
  }
  return first === -1 ? [0, Math.max(0, tokens.length - 1)] : [first, last];
}

/** Builds the API payload from in-memory occurrence marks, reading the exact
 *  text and containing sentence out of the tokenized article. */
export function toMarks(marks: MarkPos[], paragraphs: Paragraph[]): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    const sentence = paragraphs[m.p]?.sentences[m.s];
    if (!sentence) continue;
    const pos = { p: m.p, s: m.s, t: m.t };
    if (m.kind === "sentence") {
      out.push({ text: sentence.text, sentence: sentence.text, kind: "sentence", pos });
    } else {
      const kind = m.t[0] === m.t[1] ? "word" : "span";
      out.push({ text: rangeText(sentence.tokens, m.t[0], m.t[1]), sentence: sentence.text, kind, pos });
    }
  }
  return out;
}

/** Recovers in-memory occurrence marks from a saved session. Marks without a
 *  `pos` (legacy data) can't be placed on tokens and are dropped here. */
export function fromMarks(marks: Mark[]): MarkPos[] {
  const out: MarkPos[] = [];
  for (const m of marks) {
    if (!m.pos) continue;
    out.push({ kind: m.kind, p: m.pos.p, s: m.pos.s, t: m.pos.t });
  }
  return out;
}
