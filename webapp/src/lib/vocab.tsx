import type { Pos } from "../api/types.js";

/** The minimal shape needed to render a lemma with its article/part of speech.
 *  Shared by the Review, Bank and reading-history screens so they read alike. */
export interface LemmaLike {
  lemma: string;
  pos: Pos;
  gender: "m" | "f" | null;
}

export const POS_LABEL: Record<Pos, string> = {
  verb: "verbo",
  noun: "sustantivo",
  adj: "adjetivo",
  adv: "adverbio",
  phrase: "frase",
  other: "palabra",
};

/** Big lemma line: nouns carry their article so gender reads at a glance
 *  ("el lanzamiento" / "la expectativa"); everything else shows the plain
 *  dictionary form. */
export function displayLemma(item: LemmaLike): string {
  if (item.pos === "noun" && item.gender) {
    return `${item.gender === "m" ? "el" : "la"} ${item.lemma}`;
  }
  return item.lemma;
}

/** Renders a sentence with the marked surface form highlighted. Falls back to
 *  the plain sentence when the surface can't be located. */
export function highlightSurface(sentence: string, surface: string) {
  const idx = surface ? sentence.toLowerCase().indexOf(surface.toLowerCase()) : -1;
  if (idx === -1) return sentence;
  return (
    <>
      {sentence.slice(0, idx)}
      <span className="word-marked">{sentence.slice(idx, idx + surface.length)}</span>
      {sentence.slice(idx + surface.length)}
    </>
  );
}
