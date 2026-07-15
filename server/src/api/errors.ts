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

// Messages are Spanish: they're surfaced verbatim in the Mini App UI (TZ 5.2).
export const Errors = {
  unauthorized: () => new ApiError(401, "unauthorized", "Debes iniciar sesión desde Telegram"),
  forbidden: () => new ApiError(403, "forbidden", "Acceso denegado"),
  notFound: (what: string) => new ApiError(404, "not_found", `No se encontró: ${what}`),
  badRequest: (message: string) => new ApiError(400, "bad_request", message),
  conflict: (message: string) => new ApiError(409, "conflict", message),
  rateLimited: (message: string) => new ApiError(429, "rate_limited", message),
  llmUnavailable: () =>
    new ApiError(503, "llm_unavailable", "El servicio de generación no está disponible ahora, intenta de nuevo más tarde"),
  internal: () => new ApiError(500, "internal_error", "Error interno del servidor"),
};
