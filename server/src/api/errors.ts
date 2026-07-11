export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }

  toBody() {
    return { error: { code: this.code, message: this.message } };
  }
}

export const Errors = {
  unauthorized: () => new ApiError(401, "unauthorized", "Требуется вход через Telegram"),
  notFound: (what: string) => new ApiError(404, "not_found", `${what} не найден(а)`),
  badRequest: (message: string) => new ApiError(400, "bad_request", message),
  rateLimited: (message: string) => new ApiError(429, "rate_limited", message),
  llmUnavailable: () =>
    new ApiError(503, "llm_unavailable", "Сервис генерации временно недоступен, попробуйте позже"),
  internal: () => new ApiError(500, "internal_error", "Внутренняя ошибка сервера"),
};
