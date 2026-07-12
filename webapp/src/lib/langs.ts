import type { ExplainLang } from "../api/types.js";
import { t, type Lang } from "./i18n.js";

/** Label for one option of the explanation-language picker (Onboarding and
 *  Settings). Russian and English keep their own names; the Spanish option
 *  ("Solo español") is localized to the current chrome language. */
export function langLabel(uiLang: Lang, value: ExplainLang): string {
  if (value === "ru") return "Русский";
  if (value === "en") return "English";
  return t(uiLang, "lang.esOnly");
}
