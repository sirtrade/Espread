import type { UserRow } from "../db/repositories/users.js";
import type { ArticleRow, ReadArticleSummary } from "../db/repositories/articles.js";
import type { SessionRow } from "../db/repositories/sessions.js";
import type { BankItemRow } from "../db/repositories/bank.js";

export function serializeProfile(user: UserRow, topics: string[]) {
  return {
    id: user.id,
    tgUserId: user.tgUserId,
    username: user.username,
    level: user.level,
    explainLang: user.explainLang,
    timezone: user.timezone,
    topics,
    dailyEnabled: user.dailyEnabled,
    dailyTime: user.dailyTime,
    botQuizzesPerDay: user.botQuizzesPerDay,
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
    markedWordsCount: (JSON.parse(row.markedWords) as string[]).length,
    markedSentsCount: (JSON.parse(row.markedSents) as string[]).length,
  };
}

export function serializeReadArticle(article: ArticleRow) {
  return {
    ...serializeArticle(article),
    readAt: article.readAt,
    markedWords: JSON.parse(article.markedWords) as string[],
    markedSents: JSON.parse(article.markedSents) as string[],
    reviewResult: article.reviewResult ? (JSON.parse(article.reviewResult) as unknown) : null,
  };
}

export function serializeSession(session: SessionRow) {
  return {
    id: session.id,
    articleId: session.articleId,
    markedWords: JSON.parse(session.markedWords) as string[],
    markedSents: JSON.parse(session.markedSents) as string[],
    state: session.state,
    updatedAt: session.updatedAt,
  };
}

export function serializeBankItem(item: BankItemRow) {
  return {
    id: item.id,
    term: item.term,
    isPhrase: item.isPhrase,
    status: item.status,
    exposures: item.exposures,
    cleanStreak: item.cleanStreak,
    translation: item.translation,
    firstContext: item.firstContext,
    updatedAt: item.updatedAt,
  };
}
