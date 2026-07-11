import type { Article, BankItem, CompleteResult, Profile, ReviewResult, Session, Stats } from "./types.js";

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

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...opts, headers: { ...headers, ...(opts.headers as Record<string, string>) } });
  } catch {
    throw new ApiRequestError("No se pudo conectar con el servidor. Revisa tu conexión.", "network_error", 0);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(
      body?.error?.message ?? "Ocurrió un error inesperado",
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
  createArticle: () => request<{ article: Article; session: Session }>("/articles", { method: "POST" }),
  getSession: () => request<{ session: Session | null; article: Article | null }>("/session"),
  putSession: (markedWords: string[], markedSents: string[]) =>
    request<{ ok: true }>("/session", { method: "PUT", body: JSON.stringify({ markedWords, markedSents }) }),
  deleteSession: () => request<{ ok: true }>("/session", { method: "DELETE" }),
  reviewSession: () => request<ReviewResult>("/session/review", { method: "POST" }),
  completeSession: () => request<CompleteResult>("/session/complete", { method: "POST" }),
  getBank: (status?: string) => request<{ items: BankItem[] }>(`/bank${status ? `?status=${status}` : ""}`),
  getStats: () => request<Stats>("/stats"),
};
