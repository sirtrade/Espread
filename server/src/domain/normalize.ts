/**
 * Normalizes a Spanish word or phrase for bank storage/lookup:
 * lowercase, punctuation stripped, collapsed whitespace. Keeps
 * Spanish diacritics (á é í ó ú ü ñ) since they distinguish meaning.
 */
export function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFC")
    .replace(/[¡!¿?.,;:()"“”«»\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
