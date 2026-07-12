import {
  init,
  mountThemeParamsSync,
  bindThemeParamsCssVars,
  isThemeParamsDark,
  mountViewport,
  expandViewport,
  hapticFeedbackImpactOccurred,
  hapticFeedbackSelectionChanged,
  hapticFeedbackNotificationOccurred,
  showPopup,
  isPopupSupported,
  retrieveLaunchParams,
} from "@telegram-apps/sdk-react";
import type { ExplainLang } from "../api/types.js";

/** True once bootstrapTelegram() ran inside an actual Telegram WebView. */
let inTelegram = false;

export function isInTelegram(): boolean {
  return inTelegram;
}

/** Initializes the Telegram Mini App SDK: theme sync, viewport expansion. No-ops outside Telegram (local dev). */
export function bootstrapTelegram(): void {
  try {
    init();
    mountThemeParamsSync();
    bindThemeParamsCssVars();
    mountViewport()
      .then(() => expandViewport())
      .catch(() => {});
    inTelegram = true;
    applyDarkClass();
  } catch {
    inTelegram = false;
    applyDarkClass();
  }
}

function applyDarkClass() {
  const dark = inTelegram ? safeIsDark() : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
}

function safeIsDark(): boolean {
  try {
    return isThemeParamsDark();
  } catch {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
}

/** Best-effort UI language before the user has picked one (Onboarding, the
 *  auth gate, network errors): derived from Telegram's `user.language_code`.
 *  Russian and Spanish map to themselves; everything else falls back to English. */
export function initialLang(): ExplainLang {
  let code: string | undefined;
  try {
    code = retrieveLaunchParams(true).tgWebAppData?.user?.languageCode;
  } catch {
    code = undefined;
  }
  const base = (code ?? "").slice(0, 2).toLowerCase();
  if (base === "ru") return "ru";
  if (base === "es") return "es";
  return "en";
}

export function hapticSelect(): void {
  if (!inTelegram) return;
  try {
    hapticFeedbackSelectionChanged();
  } catch {
    /* not supported on this client */
  }
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "light"): void {
  if (!inTelegram) return;
  try {
    hapticFeedbackImpactOccurred(style);
  } catch {
    /* not supported on this client */
  }
}

export function hapticSuccess(): void {
  if (!inTelegram) return;
  try {
    hapticFeedbackNotificationOccurred("success");
  } catch {
    /* not supported on this client */
  }
}

/** Native confirm dialog, falling back to window.confirm outside Telegram. */
export async function confirmDialog(message: string, confirmText: string): Promise<boolean> {
  if (inTelegram && isPopupSupported()) {
    try {
      const buttonId = await showPopup({
        message,
        buttons: [
          { id: "yes", type: "destructive" as const, text: confirmText },
          { id: "no", type: "cancel" as const },
        ],
      });
      return buttonId === "yes";
    } catch {
      /* fall through to window.confirm */
    }
  }
  return window.confirm(message);
}
