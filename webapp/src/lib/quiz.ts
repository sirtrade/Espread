/** Client-side twin of the server's option builder, used for the
 *  post-reading quiz where all data is already on the device. */

const FALLBACK_DISTRACTORS = [
  "desarrollo",
  "esfuerzo",
  "amenaza",
  "propuesta",
  "recurso",
  "acuerdo",
  "fuente",
  "medida",
  "apoyo",
  "nivel",
  "crecimiento",
  "búsqueda",
];

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildOptions(correct: string, pool: readonly string[], count = 4): string[] {
  const seen = new Set([correct.toLowerCase()]);
  const distractors: string[] = [];
  for (const c of [...shuffle(pool), ...FALLBACK_DISTRACTORS]) {
    if (distractors.length >= count - 1) break;
    if (seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    distractors.push(c);
  }
  return shuffle([correct, ...distractors]);
}
