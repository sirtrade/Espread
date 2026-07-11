import type { UserRow } from "../db/repositories/users.js";
import type { ArticleRow } from "../db/repositories/articles.js";
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
