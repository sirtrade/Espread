import type { UserRow } from "../db/repositories/users.js";
import type { ArticleRow, ReadArticleSummary } from "../db/repositories/articles.js";
import type { SessionRow } from "../db/repositories/sessions.js";
import type { BankItemRow } from "../db/repositories/bank.js";
import type { Mark } from "../domain/marks.js";

export function serializeProfile(user: UserRow, topics: string[]) {
  return {
    id: user.id,
    tgUserId: user.tgUserId,
    username: user.username,
    level: user.level,
    explainLang: user.explainLang,
    timezone: user.timezone,
    theme: user.theme,
    fontSize: user.fontSize,
    topics,
    dailyEnabled: user.dailyEnabled,
    dailyTime: user.dailyTime,
    botQuizzesPerDay: user.botQuizzesPerDay,
    activePoolLimit: user.activePoolLimit,
    practiceSize: user.practiceSize,
    onboarded: user.onboardedAt !== null,
  };
}

export function serializeArticle(article: ArticleRow) {
  return {
    id: article.id,
    title: article.title,
    body: article.body,
    topic: article.topic,
    sourceName: article.sourceName,
    sourceUrl: article.sourceUrl,
    createdAt: article.createdAt,
  };
}

export function serializeHistoryItem(row: ReadArticleSummary) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    readAt: row.readAt,
    marksCount: (JSON.parse(row.marks) as unknown[]).length,
  };
}

export function serializeReadArticle(article: ArticleRow) {
  return {
    ...serializeArticle(article),
    readAt: article.readAt,
    marks: JSON.parse(article.marks) as Mark[],
    reviewResult: article.reviewResult ? (JSON.parse(article.reviewResult) as unknown) : null,
  };
}

export function serializeSession(session: SessionRow) {
  return {
    id: session.id,
    articleId: session.articleId,
    marks: JSON.parse(session.marks) as Mark[],
    state: session.state,
    updatedAt: session.updatedAt,
  };
}

export function serializeBankItem(item: BankItemRow) {
  return {
    id: item.id,
    lemma: item.lemma,
    surfaceForm: item.surfaceForm,
    isPhrase: item.isPhrase,
    pos: item.pos,
    gender: item.gender,
    status: item.status,
    exposures: item.exposures,
    translation: item.translation,
    note: item.note,
    firstContext: item.firstContext,
    contextTranslation: item.contextTranslation,
    distractors: item.distractors ? (JSON.parse(item.distractors) as string[]) : null,
    freqBand: item.freqBand,
    nextDueAt: item.nextDueAt,
    srsStage: item.srsStage,
    updatedAt: item.updatedAt,
  };
}
