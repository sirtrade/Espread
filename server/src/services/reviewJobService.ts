import { getActiveSession } from "../db/repositories/sessions.js";
import { Errors } from "../api/errors.js";
import { logger } from "../lib/logger.js";
import { reviewSession, type ReviewView } from "./sessionService.js";

type ReviewPollResult =
  | { status: "processing" }
  | { status: "completed"; result: ReviewView };

type ReviewJob =
  | { state: "running" }
  | { state: "failed"; cleanupTimer: ReturnType<typeof setTimeout> };

const jobs = new Map<number, ReviewJob>();
const FAILED_JOB_TTL_MS = 5 * 60 * 1000;

/**
 * Starts a review outside the request lifecycle and lets subsequent requests
 * poll for its persisted result. This keeps slow LLM calls behind short HTTP
 * responses so Fly's idle connection timeout cannot abort the user flow.
 */
export async function pollReviewSession(userId: number): Promise<ReviewPollResult> {
  const session = await getActiveSession(userId);
  if (!session) throw Errors.notFound("Sesión de lectura");

  if (session.state === "reviewed" && session.reviewResult) {
    return { status: "completed", result: await reviewSession(userId) };
  }

  const existing = jobs.get(userId);
  if (existing?.state === "running") return { status: "processing" };
  if (existing?.state === "failed") {
    clearTimeout(existing.cleanupTimer);
    jobs.delete(userId);
    throw Errors.llmUnavailable();
  }

  jobs.set(userId, { state: "running" });
  void reviewSession(userId).then(
    () => {
      jobs.delete(userId);
    },
    (err) => {
      logger.error({ err, userId }, "Background review failed");
      const cleanupTimer = setTimeout(() => jobs.delete(userId), FAILED_JOB_TTL_MS);
      cleanupTimer.unref();
      jobs.set(userId, { state: "failed", cleanupTimer });
    },
  );

  return { status: "processing" };
}
