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
} from "@telegram-apps/sdk-react";

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
