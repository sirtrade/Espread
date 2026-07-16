# Баги

> Порядок = приоритет: верхняя задача — самая важная. Формат и процесс — в
> `README.md` этой папки.

## B-4. Интеграционный тест грамматического цикла делает реальный вызов Anthropic
- **Приоритет:** P2 — тесты остаются зелёными, но прогон зависит от сети и
  может тратить реальные деньги при валидном ключе в окружении.
- **Проблема/мотивация:** `tests/integration.grammarLifecycle.test.ts` — в
  отличие от соседних integration-тестов — не мокает
  `../src/llm/client.js`. Его статья сохраняется с пустыми `lemmas`, поэтому
  `completeSession` → `ensureArticleLemmas` → `extractArticleLemmas` делает
  настоящий сетевой вызов Anthropic (в прогоне виден warn
  `AuthenticationError: invalid x-api-key`, `Article lemmatization failed`).
  Тест проходит только благодаря graceful degradation этого пути; при
  валидном `ANTHROPIC_API_KEY` в окружении вызов пройдёт и запишет
  `llm_calls`/расход.
- **Что сделать:** замокать клиент по образцу соседних файлов
  (`vi.hoisted` + `vi.mock("../src/llm/client.js")`) либо дать тестовой
  статье непустые `lemmas`, чтобы ленивый путь не срабатывал.
- **Критерии приёмки:** `npm test` в `server/` не делает сетевых вызовов;
  warn про lemmatization из этого файла исчезает из прогона; тесты зелёные.
- **Детали/ссылки:** `server/tests/integration.grammarLifecycle.test.ts`,
  `server/src/services/sessionService.ts` (`ensureArticleLemmas`); реестр
  §7.2, §18.1.
