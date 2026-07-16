import { describe, expect, it, vi } from "vitest";

const { getActiveSessionMock, reviewSessionMock } = vi.hoisted(() => ({
  getActiveSessionMock: vi.fn(),
  reviewSessionMock: vi.fn(),
}));

vi.mock("../src/db/repositories/sessions.js", () => ({
  getActiveSession: getActiveSessionMock,
}));

vi.mock("../src/services/sessionService.js", () => ({
  reviewSession: reviewSessionMock,
}));

const { pollReviewSession } = await import("../src/services/reviewJobService.js");

describe("background review jobs", () => {
  it("returns short processing responses and later serves the persisted result", async () => {
    let reviewed = false;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = { items: [], wovenTerms: [], grammarCandidates: [] };

    getActiveSessionMock.mockImplementation(async () => ({
      id: 1,
      state: reviewed ? "reviewed" : "reading",
      reviewResult: reviewed ? "{}" : null,
    }));
    reviewSessionMock.mockImplementationOnce(async () => {
      await pending;
      reviewed = true;
      return result;
    });
    reviewSessionMock.mockResolvedValue(result);

    await expect(pollReviewSession(991)).resolves.toEqual({ status: "processing" });
    await expect(pollReviewSession(991)).resolves.toEqual({ status: "processing" });
    expect(reviewSessionMock).toHaveBeenCalledTimes(1);

    finish();
    await pending;
    await vi.waitFor(() => expect(reviewed).toBe(true));

    await expect(pollReviewSession(991)).resolves.toEqual({ status: "completed", result });
  });
});
