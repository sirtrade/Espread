export interface WordToken {
  type: "word";
  text: string;
}
export interface PunctToken {
  type: "punct";
  text: string;
}
export type InlineToken = WordToken | PunctToken;

export interface Sentence {
  text: string;
  tokens: InlineToken[];
}

export interface Paragraph {
  sentences: Sentence[];
}

const WORD_RE = /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/g;
const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/g;

function splitIntoTokens(sentence: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  for (const match of sentence.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push({ type: "punct", text: sentence.slice(lastIndex, start) });
    }
    tokens.push({ type: "word", text: match[0] });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < sentence.length) {
    tokens.push({ type: "punct", text: sentence.slice(lastIndex) });
  }
  return tokens;
}

/** Splits article body into paragraphs -> sentences -> word/punctuation tokens, for tap-to-mark UI. */
export function tokenizeArticle(body: string): Paragraph[] {
  return body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      sentences: paragraph
        .split(SENTENCE_SPLIT_RE)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({ text, tokens: splitIntoTokens(text) })),
    }));
}
