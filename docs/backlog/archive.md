# Архив выполненных задач

> Сюда переносятся карточки задач целиком после выполнения: добавь строку
> `- **Выполнено:** <дата>, <ветка или PR #N>` в начало карточки и удали её из
> исходного списка (в том же PR, что и реализация). Порядок — новые сверху.

## F-10. Независимый контроль качества сгенерированных статей
- **Выполнено:** 2026-07-15, ветка `feat/f-10-article-quality` (код
  `f731457`)
- **Приоритет:** P1
- **Проблема/мотивация:** Единственный writer-вызов мог сохранить статью с
  неподходящим CEFR, неестественными коллокациями, декоративно сложной лексикой
  или некорректной длиной. Самооценка тем же автором усиливала bias, а сбой
  дополнительной проверки не должен был ломать чтение.
- **Что сделано:** CEFR-профили и общие правила естественности вынесены в
  `server/src/llm/articleRubric.ts`. После написания статья проходит локальные
  детерминированные проверки длины и абзацев, независимый структурированный
  LLM-аудит и при необходимости до двух минимальных rewrite-попыток. Решение о
  rewrite принимает сервер по hard-fail, major-проблемам и порогу оценок, а не
  по boolean модели. При сбое сохраняется лучшая доступная версия. Вызовы
  `audit`/`rewrite` учитываются в стоимости, но не расходуют дневной лимит
  генераций. Реестр функционала §6.3–6.4 и §22 обновлён.
- **Критерии приёмки:** Чистая статья сохраняется без rewrite; объективный
  hard-fail, major-проблема или оценка ниже 4 запускают rewrite; выполняется не
  более двух rewrite; при ошибке LLM генерация деградирует к лучшему тексту, а
  не отвечает 500; схемы отклоняют некорректный verdict; CEFR-рубрики и
  локальные проверки покрыты тестами. `npm run typecheck` и `npm test` в
  `server/` проходят (223 теста).
- **Детали/ссылки:** `server/src/domain/articleQuality.ts`,
  `server/src/llm/articleQuality.ts`, `server/src/llm/articleRubric.ts`,
  `server/src/llm/articleGeneration.ts`, `server/src/llm/schemas.ts`,
  `server/tests/articleQualityChecks.test.ts`,
  `server/tests/articleQualityPipeline.test.ts`,
  `server/tests/articleQualitySchema.test.ts`,
  `server/tests/articleRubric.test.ts`, `docs/functionality-registry.md` §6.

---

## F-2. Понизить вес пассивного чтения в SRS
- **Выполнено:** 2026-07-15, ветка `claude/backlog-task-impl-h129y8`
- **Приоритет:** P1
- **Проблема/мотивация:** «Чистая экспозиция» (слово встретилось в статье и не
  помечено) поднимала ступень наравне с правильным ответом и могла довести слово
  до `learned` без единого воспроизведения. «Не отметил» ≠ «вспомнил», статус
  «выучено» был инфлирован.
- **Что сделано:** По этапу 6 роадмапа. Добавлена константа
  `READING_CREDIT_MAX_STAGE = 2` (`server/src/domain/srs.ts`). В
  `applyReviewToBank` (`server/src/domain/bank.ts`) чистая экспозиция теперь
  всегда инкрементит `exposures`, но двигает ступень (`advanceSrs`,
  `nextDueAt`, `lastCreditAt`) только при `srsStage <= READING_CREDIT_MAX_STAGE`
  и не чаще раза в локальные сутки; выше потолка расписание не трогается, слово
  остаётся в ротации weaving. Ветка graduation из reading-пути убрана — чтение
  больше никогда не graduate'ит слово в `learned` (graduation остался только в
  `applyPracticeAnswer`). Копирайт Review-экрана обновлён: `review.wovenHintSrs`
  переформулирован, добавлен ключ `review.wovenPractice` («тренируй, чтобы
  продвинуть») для слов выше потолка вместо неверного предсказания «mastered»
  от чтения; убран неиспользуемый импорт `SRS_MAX_STAGE`. Клиентское зеркало
  `webapp/src/lib/srs.ts` дополнено `READING_CREDIT_MAX_STAGE`. Все новые строки
  UI — через i18n (ru/en/es). Опциональный пункт 3 роадмапа (требовать именно
  typed-ответ для graduation) не реализован — помечен «согласовать с владельцем»,
  в объём F-2 не входил. Обновлены `docs/functionality-registry.md` §7.3, §8.1,
  §8.2, §22, §23, §24 и `docs/retention-roadmap.md` (этап 6, таблица статусов).
- **Критерии приёмки:** довести слово до «learned» можно только ответами в
  практике/боте; чтение помогает только на нижних ступенях (см. этап 6
  роадмапа). Тесты: экспозиция на ступени 3+ не двигает расписание, слово на
  верхней ступени не graduate'ится чтением, экспозиция на ступени 2 всё ещё
  поднимает (`server/tests/bank.test.ts`); константа и её потолок
  (`server/tests/srs.test.ts`). `npm run typecheck` и `npm test` в `server/`
  проходят (183 теста); webapp типизируется.
- **Детали/ссылки:** `docs/retention-roadmap.md` этап 6,
  `docs/retention-audit.md` §4, `server/src/domain/srs.ts`,
  `server/src/domain/bank.ts`, `webapp/src/screens/Review.tsx`,
  `webapp/src/lib/srs.ts`, `webapp/src/lib/i18n.ts`. Влияет на F-3 (сигнал
  «известное слово» теперь честнее).

---

## M-3. Добавить уровень CEFR C2
- **Выполнено:** 2026-07-15, ветка `claude/backlog-task-impl-x161z0`
- **Приоритет:** P2
- **Проблема/мотивация:** Приложение поддерживало только уровни A2/B1/B2/C1,
  поэтому продвинутые читатели упирались в потолок C1 (5000 самых частотных слов)
  и получали статьи проще, чем им нужно. Верхняя ступень CEFR — C2 (владение,
  близкое к носителю) — отсутствовала.
- **Что сделано:** C2 добавлен как опция уровня во всех точках. Тип уровня
  расширен до `A2|B1|B2|C1|C2`: `Level` (`webapp/src/api/types.ts`), массивы
  `LEVELS` (`Onboarding.tsx`, `Settings.tsx`), `CefrLevel`
  (`server/src/llm/articleGeneration.ts`), локальный тип в
  `server/src/db/repositories/users.ts`, enum в `server/src/db/schema.ts`,
  Zod-схема `level` в `server/src/api/validation.ts`. **По согласованию с
  владельцем:** для C2 частотный потолок снят полностью — `LEVEL_FREQ_CAP`
  типизирован как `Record<CappedLevel, number>` (без ключа C2), а
  `frequencyInstruction("C2")` возвращает мягкую инструкцию (богатая
  естественная лексика near-native, редкие слова/идиомы/журнальный или
  литературный регистр, без ограничения по частотному списку). **Миграция БД не
  добавлялась** (тоже по согласованию): колонка `users.level` — `text DEFAULT
  'A2' NOT NULL` без CHECK-констрейнта, existing БД уже принимает `"C2"`; enum
  действует на уровне TypeScript и Zod-валидации `PATCH /api/me`. Дефолт остаётся
  `A2`. Пер-уровневых i18n-ключей не требуется (метки уровней выводятся как есть).
  Обновлён `docs/functionality-registry.md` §4, §6.3, §14, §20, §22.
- **Критерии приёмки:** C2 доступен в онбординге и настройках, выбор персистит
  (`PATCH /api/me { level: "C2" }` проходит валидацию); генерация статьи для C2
  использует мягкую инструкцию без потолка (`frequencyInstruction("C2")` не падает
  и не ссылается на частотный список); обновлённый `server/tests/reviewSchema.test.ts`
  зелёный (C2 отсутствует в `LEVEL_FREQ_CAP`, инструкция C2 без «palabras más
  frecuentes»). `npm run typecheck` и `npm test` в `server/` проходят (181 тест);
  webapp типизируется и собирается.
- **Детали/ссылки:** `server/src/llm/articleGeneration.ts` (`CefrLevel`,
  `LEVEL_FREQ_CAP`, `frequencyInstruction`), `server/src/api/validation.ts`,
  `server/src/db/schema.ts`, `server/src/db/repositories/users.ts`,
  `webapp/src/api/types.ts`, `webapp/src/screens/Onboarding.tsx`,
  `webapp/src/screens/Settings.tsx`, `server/tests/reviewSchema.test.ts`,
  `docs/functionality-registry.md` §4, §6.3, §14, §20, §22. Связано с F-8.

---

## M-2. Свободное письмо — предлагать явно на верхних ступенях SRS
- **Выполнено:** 2026-07-15, ветка `claude/backlog-task-impl-fe3sk2`
- **Приоритет:** P2
- **Проблема/мотивация:** Свободное письмо с LLM-проверкой — самое сильное
  упражнение в приложении (generation effect), но было спрятано за мелкую
  ссылку «✍️ Написать предложение со словом», и пользователь мог ни разу её не
  заметить.
- **Что сделано:** Очередь тренировки теперь отдаёт `srsStage` в каждой карточке
  (`PracticeCard`: сервер `server/src/api/routes/practice.ts`, клиент
  `webapp/src/api/types.ts`, `SessionCard`/`fromPracticeCard`
  `webapp/src/lib/cards.ts`). `QuizSession` прокидывает в `renderExtra` третий
  аргумент — верность ответа. На ступенях `srsStage >= 4`
  (`WRITING_AUTO_STAGE`, `webapp/src/screens/Practice.tsx`) после **правильного**
  ответа блок письма (`<textarea>` + поощряющая строка `practice.writePrompt`)
  разворачивается сразу; на ступенях ниже и при неверном ответе — прежняя
  ссылка. SRS не тронут (reinforcement-only). Новая строка `practice.writePrompt`
  локализована (ru/en/es). Обновлены `docs/functionality-registry.md` §10.1,
  §10.4 и `docs/retention-roadmap.md` (этап 10.4).
- **Критерии приёмки:** На ступени ≥4 textarea видна сразу после правильного
  ответа; на ступенях ниже — прежняя ссылка; `srsStage` присутствует в карточке
  очереди (интеграционный тест `server/tests/integration.practiceQueue.test.ts`);
  `docs/functionality-registry.md` §10.4 обновлён. `npm run typecheck` и
  `npm test` в `server/` проходят (180 тестов), `npm run typecheck` в `webapp/`
  проходит.
- **Детали/ссылки:** `docs/retention-roadmap.md` этап 10.4,
  `webapp/src/screens/Practice.tsx` (`renderExtra`),
  `webapp/src/components/QuizSession.tsx`, `docs/retention-audit.md` «Мелочи».

---

## M-1. Настраиваемый размер сессии Práctica
- **Выполнено:** 2026-07-15, ветка `claude/backlog-task-impl-cy7z5c`
- **Приоритет:** P2
- **Проблема/мотивация:** Очередь тренировки всегда запрашивалась с
  `limit=10`. Несколько коротких сессий лучше одной длинной (эффект
  распределённой практики), и пользователи различаются по выносливости.
- **Что сделано:** Настройка «Карточек за тренировку» в Settings (пресеты
  5/10/20, дефолт 10) хранится в профиле (`users.practice_size`, миграция
  `0011_practice_size`, default 10; `PATCH /api/me { practiceSize }`, клемп
  1–30 в валидации). Экран Práctica запрашивает
  `GET /practice/queue?limit=practiceSize`; сервер клемпит вход новой чистой
  функцией `clampPracticeSize` (`server/src/domain/practiceSize.ts`,
  дефолт/границы 1–30). Строки настройки локализованы (ru/en/es). Обновлены
  `docs/functionality-registry.md` §10, §14, §20, §20.1, §22 и
  `docs/retention-roadmap.md` (этап 10.2).
- **Критерии приёмки:** Выбранный размер сохраняется в профиле и реально
  ограничивает длину сессии (юнит-тесты `server/tests/practiceSize.test.ts`;
  интеграционные `server/tests/integration.practiceSize.test.ts`: PATCH
  персистит, queue уважает limit, значения вне 1–30 → 400); строка настройки
  локализована (ru/en/es); реестр функционала §10 и §14 обновлён.
  `npm run typecheck` и `npm test` в `server/` проходят (179 тестов).
- **Детали/ссылки:** `docs/retention-roadmap.md` этап 10.2,
  `webapp/src/screens/Settings.tsx`, `webapp/src/screens/Practice.tsx`.

---

## B-2. Анти-фарм SRS считается по UTC-суткам, а не по локальным
- **Выполнено:** 2026-07-15, ветка `claude/backlog-task-impl-z0hm94`
- **Приоритет:** P2
- **Проблема/мотивация:** `creditAllowedToday`/`isSameUtcDay`
  (`server/src/domain/srs.ts`) сравнивали календарные сутки в UTC. Для
  пользователя в UTC+3 два «кредита» (подъёма по лестнице) были возможны в одни
  локальные сутки: например, в 02:00 и в 23:00 по местному времени.
- **Что сделано:** Добавлен хелпер `localDayKey(ms, timeZone)` в
  `server/src/lib/timezone.ts` (ключ дня «YYYY-MM-DD» по таймзоне, безопасный
  откат на UTC при неизвестной зоне). `isSameUtcDay` заменён на
  `isSameLocalDay(a, b, timeZone)`, `creditAllowedToday` теперь принимает
  `timeZone`. Таймзона пользователя (`user.timezone`) прокинута в
  `applyPracticeAnswer` (Práctica через `POST /practice/answer`, бот-викторина)
  и `applyReviewToBank` (завершение чтения). Известное ограничение снято из
  `docs/functionality-registry.md` §8.2 и §24; статус этапа 10.1 в роадмапе
  обновлён.
- **Критерии приёмки:** Два успеха в одни локальные сутки дают один подъём;
  тесты с таймзонами UTC+3 (`Europe/Moscow`) и UTC−8 (`America/Los_Angeles`) —
  доменные (`server/tests/srs.test.ts`) и интеграционный через
  `applyPracticeAnswer` (`server/tests/integration.practiceAnswer.test.ts`);
  известное ограничение убрано из реестра функционала §8.2 и §24.
  `npm run typecheck` и `npm test` в `server/` проходят (165 тестов).
- **Детали/ссылки:** `docs/retention-roadmap.md` этап 10.1,
  `docs/functionality-registry.md` §8.2.

---

## F-1. Typed recall (ввод с клавиатуры) в webapp
- **Выполнено:** 2026-07-13, ветка `claude/feature-f-1-74gzml`
- **Приоритет:** P1
- **Проблема/мотивация:** В mini-app вся тренировка — узнавание из 4 кнопок,
  слабейшая форма retrieval (шанс угадать 25%, угадывание двигает SRS на
  полную ступень). Домен typed recall уже написан
  (`server/src/domain/typedQuiz.ts`) и использовался только ботом. Это находка
  №1 научного аудита.
- **Что сделано:** По этапу 5 роадмапа. Сервер отдаёт карточки типа `"typed"`
  для `srsStage >= TYPED_QUIZ_MIN_STAGE` (=2) через новую чистую функцию
  `buildQueueCard` (`server/src/domain/practice.ts`; fallback на MC, если
  безопасная typed-карточка не строится). Грейдинг — на сервере:
  `POST /practice/answer` принимает `typedAnswer`, вычисляет верность через
  `gradeTypedAnswer` по accepted-формам слова (клиенту не доверяем), возвращает
  `verdict` (`exact | spelling | wrong`), `correct` и правильную форму `answer`.
  Клиент (`QuizSession`) рендерит текстовое поле + кнопку «Ответить» и вердикт с
  правильной формой/переводом/контекстом. Ретраи typed-карточек в сессии
  грейдятся локально зеркалом `webapp/src/lib/typedRecall.ts` (на сервер не
  уходят). MC оставлен для ступеней 0–1 и post-reading Quiz; бот не тронут.
  Все новые строки UI — через i18n (ru/en/es). Схема БД не менялась (typed
  переиспользует существующие поля карточки).
- **Критерии приёмки:** Слово со ступени 2+ в Práctica требует ввода с
  клавиатуры; MC остаётся для ступеней 0–1; бот продолжает работать без
  изменений. Тесты: `buildQueueCard` (typed для stage≥2, fallback на MC) в
  `server/tests/practice.test.ts`; серверный грейдинг typed-ответа
  (exact/spelling/wrong, lapse) на уровне роутов в
  `server/tests/integration.practiceQueue.test.ts`. `npm run typecheck` и
  `npm test` в `server/` проходят; webapp собирается и типизируется.
- **Детали/ссылки:** `docs/retention-roadmap.md` этап 5,
  `docs/retention-audit.md` §1, `docs/functionality-registry.md` §10–11, §17.

---

## B-1. README описывает удалённую механику «3 чистые встречи → learned»
- **Выполнено:** 2026-07-13, ветка `claude/task-b-1-br2q2b`
- **Приоритет:** P1
- **Проблема/мотивация:** Первый абзац корневого `README.md` утверждал, что
  слово становится `learned` после «3 „чистых" встреч подряд подряд без
  пометки» (заодно опечатка «подряд подряд»). Эта механика (`clean_streak`)
  удалена миграцией `0008`; реальное поведение — 7-ступенчатая SRS-лестница
  (`docs/functionality-registry.md` §8.2) с graduation на верхней ступени.
  Для репозитория, где актуальность документации — часть Definition of Done,
  это подрывало доверие ко всей документации.
- **Что сделано:** Переписан вводный абзац `README.md` под актуальную
  механику (SRS-лестница 1→3→7→14→30→60→120 дней, мягкий откат при ошибке,
  graduation в `learned` на верхней ступени, устранена опечатка «подряд
  подряд»). Раздел «Банк слов» в «Архитектурных заметках» дополнен статусом
  `queued` (вкладка «в очереди», FIFO-промоушен из очереди по мере
  освобождения слотов активного пула).
- **Критерии приёмки:** README не противоречит `docs/functionality-registry.md`
  ни в одном утверждении о механике; опечатка убрана.
- **Детали/ссылки:** `README.md` (строки 3–7, 152–154),
  `docs/functionality-registry.md` §8, миграция `server/drizzle/0008`.

---

_Этапы 1–4 роадмапа закрепления были выполнены до появления этого
backlog'а — их статусы см. в `docs/retention-roadmap.md`._
