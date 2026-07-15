# Архив выполненных задач

> Сюда переносятся карточки задач целиком после выполнения: добавь строку
> `- **Выполнено:** <дата>, <ветка или PR #N>` в начало карточки и удали её из
> исходного списка (в том же PR, что и реализация). Порядок — новые сверху.

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
