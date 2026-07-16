import { retrieveRawInitData } from "@telegram-apps/sdk-react";
import { t } from "../lib/i18n.js";
import { initialLang } from "../telegram/telegram.js";
import type {
  Article,
  BankItem,
  BankStatus,
  CompleteResult,
  GrammarItem,
  GrammarStatus,
  HistoryItem,
  Mark,
  PracticeAnswerResult,
  PracticeCardType,
  PracticeCard,
  Profile,
  ReadArticle,
  SentenceCheckResult,
  ReviewResult,
  Session,
  SkipReason,
  Stats,
  KnownWord,
  LevelSuggestion,
  VocabularyStats,
} from "./types.js";

const TOKEN_KEY = "lector_token";

let token: string | null = null;

export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export function loadStoredToken(): string | null {
  if (token) return token;
  token = localStorage.getItem(TOKEN_KEY);
  return token;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// The session JWT expires after ~1h. If the user keeps the Mini App open
// longer, requests start failing with 401 — so on a 401 we transparently
// re-auth with a fresh initData from Telegram and retry the request once.
// A single in-flight promise keeps parallel 401s from firing several auths.
let reauthInFlight: Promise<boolean> | null = null;

async function reauthWithTelegram(): Promise<boolean> {
  reauthInFlight ??= (async () => {
    try {
      let initData: string | undefined;
      try {
        initData = retrieveRawInitData();
      } catch {
        return false;
      }
      if (!initData) return false;

      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { token: string };
      setToken(body.token);
      return true;
    } catch {
      return false;
    } finally {
      reauthInFlight = null;
    }
  })();
  return reauthInFlight;
}

async function request<T>(path: string, opts: RequestInit = {}, isRetry = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...opts, headers: { ...headers, ...(opts.headers as Record<string, string>) } });
  } catch {
    throw new ApiRequestError(t(initialLang(), "error.network"), "network_error", 0);
  }

  if (res.status === 401 && !isRetry && !path.startsWith("/auth/") && (await reauthWithTelegram())) {
    return request<T>(path, opts, true);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(
      body?.error?.message ?? t(initialLang(), "error.unexpected"),
      body?.error?.code ?? "unknown",
      res.status,
    );
  }
  return body as T;
}

export const api = {
  authTelegram: (initData: string) =>
    request<{ token: string; profile: Profile }>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),
  getMe: () => request<Profile>("/me"),
  patchMe: (patch: Partial<Omit<Profile, "id" | "tgUserId" | "username" | "onboarded">> & { markOnboarded?: boolean }) =>
    request<Profile>("/me", { method: "PATCH", body: JSON.stringify(patch) }),
  resetProgress: () => request<{ ok: true }>("/me/progress", { method: "DELETE" }),
  markLevelSuggestion: (interaction: LevelSuggestion & { action: "seen" | "dismissed" }) =>
    request<{ ok: true }>("/me/level-suggestion", { method: "PATCH", body: JSON.stringify(interaction) }),
  // F-19: "keep the topic" on the remove-topic banner; removal itself goes
  // through the ordinary patchMe({ topics }) flow.
  dismissTopicSuggestion: (topic: string) =>
    request<{ ok: true }>("/me/topic-suggestion", { method: "PATCH", body: JSON.stringify({ topic }) }),
  createArticle: () => request<{ article: Article; session: Session }>("/articles", { method: "POST" }),
  getSession: () => request<{ session: Session | null; article: Article | null }>("/session"),
  putSession: (marks: Mark[]) =>
    request<{ ok: true }>("/session", { method: "PUT", body: JSON.stringify({ marks }) }),
  deleteSession: () => request<{ ok: true }>("/session", { method: "DELETE" }),
  // F-17: skip the active reading. The reason is optional; a comment is only
  // sent (and only accepted by the server) with reason "other".
  skipSession: (payload: { reason?: SkipReason; comment?: string } = {}) =>
    request<{ ok: true }>("/session/skip", { method: "POST", body: JSON.stringify(payload) }),
  reviewSession: () => request<ReviewResult>("/session/review", { method: "POST" }),
  completeSession: (choices: { accepted?: string[]; rejected?: string[]; grammarAccepted?: string[] } = {}) =>
    request<CompleteResult>("/session/complete", { method: "POST", body: JSON.stringify(choices) }),
  getBank: (status?: BankStatus) => request<{ items: BankItem[] }>(`/bank${status ? `?status=${status}` : ""}`),
  patchBankItem: (id: number, status: BankStatus) =>
    request<{ item: BankItem }>(`/bank/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getGrammar: (status?: GrammarStatus) =>
    request<{ items: GrammarItem[] }>(`/grammar${status ? `?status=${status}` : ""}`),
  patchGrammarItem: (id: number, status: GrammarStatus) =>
    request<{ item: GrammarItem }>(`/grammar/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getStats: () => request<Stats>("/stats"),
  getKnownWords: () => request<{ items: KnownWord[] }>("/known-words"),
  getVocabularyStats: () => request<VocabularyStats>("/known-words/stats"),
  getHistory: (limit = 20, offset = 0) =>
    request<{ items: HistoryItem[]; total: number }>(`/articles?limit=${limit}&offset=${offset}`),
  getReadArticle: (id: number) => request<{ article: ReadArticle }>(`/articles/${id}`),
  getPracticeQueue: (limit = 10) => request<{ cards: PracticeCard[]; due: number }>(`/practice/queue?limit=${limit}`),
  // Práctica answers carry an itemId; the post-reading Quiz carries a lemma
  // (it never sees bank item ids). Multiple-choice answers report their own
  // correctness; typed-recall answers send the raw text and the server grades
  // it. Both drive the same learning + SRS update.
  postPracticeAnswer: (
    target: { itemId: number } | { lemma: string } | { grammarItemId: number },
    answer:
      | {
          correct: boolean;
          usedHint?: boolean;
          cardType: PracticeCardType;
          latencyMs: number;
        }
      | {
          typedAnswer: string;
          contextAddedAt?: number | null;
          usedHint?: boolean;
          cardType: "typed";
          latencyMs: number;
        },
  ) =>
    request<PracticeAnswerResult>("/practice/answer", {
      method: "POST",
      body: JSON.stringify({ ...target, ...answer }),
    }),
  checkPracticeSentence: (itemId: number, sentence: string) =>
    request<SentenceCheckResult>("/practice/sentence", { method: "POST", body: JSON.stringify({ itemId, sentence }) }),
};

/** The device's IANA timezone, sent with the profile so daily delivery fires at local time. */
export function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
