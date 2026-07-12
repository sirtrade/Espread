import { useAuth } from "../state/AuthContext.js";
import { initialLang } from "../telegram/telegram.js";
import type { ExplainLang } from "../api/types.js";

/** The UI (chrome) language. Learning content stays Spanish regardless. */
export type Lang = ExplainLang;

type Primitive = string | number;

/**
 * Language-aware pluralization. Russian needs three forms (one / few / many);
 * English and Spanish need two (one / other). Callers pass the forms for their
 * own language, so the returned form is always grammatical.
 */
export function plural(lang: Lang, n: number, forms: readonly string[]): string {
  if (lang === "ru") {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0]!;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]!;
    return forms[2] ?? forms[1] ?? forms[0]!;
  }
  return n === 1 ? forms[0]! : (forms[1] ?? forms[0]!);
}

/** BCP-47 locale for date formatting, derived from the UI language. */
export function locale(lang: Lang): string {
  return lang === "ru" ? "ru" : lang === "en" ? "en" : "es";
}

/**
 * The full chrome dictionary. Every key is declared here once, so a language
 * that forgets a key fails `tsc`. Parametrized strings are functions; plain
 * ones are strings (with optional `{name}` placeholders filled by `t`).
 */
export interface Dict {
  "common.retry": string;
  "common.back": string;
  "common.add": string;
  "common.next": string;
  "common.saving": string;
  "common.loading": string;
  "common.finish": string;
  "common.backHome": string;

  "gate.connecting": string;
  "auth.noSession": string;
  "auth.failed": string;
  "error.network": string;
  "error.unexpected": string;

  "lang.esOnly": string;

  "onboarding.welcome": string;
  "onboarding.subtitle": string;
  "onboarding.level": string;
  "onboarding.explainLang": string;
  "onboarding.topics": string;
  "onboarding.otherTopic": string;
  "onboarding.daily": string;
  "onboarding.dailyToggle": string;
  "onboarding.time": string;
  "onboarding.start": string;
  "onboarding.saveError": string;

  "home.settings": string;
  "home.history": string;
  "home.queuedBanner": (p: { count: number }) => string;
  "home.stat.articles": string;
  "home.stat.inProgress": string;
  "home.stat.learned": string;
  "home.queuedLink": (p: { count: number }) => string;
  "home.activeBank": string;
  "home.seeAll": string;
  "home.emptyBank": string;
  "home.practice": (p: { count: number }) => string;
  "home.newReading": string;
  "home.generating": string;
  "home.generatingHint": string;
  "home.loadError": string;
  "home.startError": string;
  "home.progressLoading": string;

  "reading.loading": string;
  "reading.source": string;
  "reading.hint": string;
  "reading.marks": (p: { count: number }) => string;
  "reading.finish": string;
  "reading.analyzing": string;
  "reading.loadError": string;
  "reading.analyzeError": string;

  "review.spinnerAnalyzing": string;
  "review.title": string;
  "review.nothingMarked": string;
  "review.whatYouMarked": string;
  "review.rare": string;
  "review.showContext": string;
  "review.hideContext": string;
  "review.save": string;
  "review.skip": string;
  "review.yourWords": string;
  "review.wovenHint": (p: { streak: number }) => string;
  "review.wovenHintSrs": string;
  "review.markedAgain": string;
  "review.readyToMaster": string;
  "review.streakProgress": (p: { filled: number; total: number }) => string;
  "review.wovenNextIn": (p: { days: number }) => string;
  "review.continue": string;
  "review.analyzeError": string;
  "review.saveError": string;

  "bank.tab.active": string;
  "bank.tab.queued": string;
  "bank.tab.learned": string;
  "bank.tab.ignored": string;
  "bank.title": string;
  "bank.search": string;
  "bank.loading": string;
  "bank.empty.active": string;
  "bank.empty.queued": string;
  "bank.empty.learned": string;
  "bank.empty.ignored": string;
  "bank.noMatch": (p: { query: string }) => string;
  "bank.encounters": (p: { n: number; total: number }) => string;
  "bank.nextPractice.soon": string;
  "bank.nextPractice.today": string;
  "bank.nextPractice.tomorrow": string;
  "bank.nextPractice.inDays": (p: { count: number }) => string;
  "bank.queuedNote": string;
  "bank.knowIt": string;
  "bank.discard": string;
  "bank.studyNow": string;
  "bank.practiceAgain": string;
  "bank.loadError": string;
  "bank.updateError": string;

  "history.backHome": string;
  "history.empty": string;
  "history.wordsCount": (p: { count: number }) => string;
  "history.sentsCount": (p: { count: number }) => string;
  "history.loadMore": string;
  "history.loading": string;
  "history.loadError": string;

  "historyArticle.back": string;
  "historyArticle.readOn": (p: { date: string }) => string;
  "historyArticle.loadError": string;
  "historyArticle.words": string;
  "historyArticle.phrases": string;

  "settings.language": string;
  "settings.languageNote": string;
  "settings.readingTheme": string;
  "settings.textSize": string;
  "settings.level": string;
  "settings.topics": string;
  "settings.addTopic": string;
  "settings.removeTopic": string;
  "settings.botQuiz": string;
  "settings.quizzesPerDay": string;
  "settings.less": string;
  "settings.more": string;
  "settings.quizOff": string;
  "settings.quizOn": (p: { count: number }) => string;
  "settings.pool": string;
  "settings.poolUnlimited": string;
  "settings.poolNoLimitNote": string;
  "settings.poolLimitNote": (p: { count: number }) => string;
  "settings.saved": string;
  "settings.saveChanges": string;
  "settings.saveError": string;
  "settings.reset": string;
  "settings.resetting": string;
  "settings.resetConfirm": string;
  "settings.resetConfirmYes": string;
  "settings.resetError": string;

  "quiz.title": string;
  "practice.title": string;
  "practice.loading": string;
  "practice.loadError": string;
  "practice.emptyTitle": string;
  "practice.emptyBody": string;
  "practice.writeSentence": (p: { lemma: string }) => string;
  "practice.writePlaceholder": (p: { lemma: string }) => string;
  "practice.check": string;
  "practice.checking": string;
  "practice.better": string;
  "practice.checkError": string;

  "quizSession.completa": string;
  "quizSession.howSay": string;
  "quizSession.pending": (p: { count: number }) => string;
  "quizSession.result": (p: { correct: number; total: number }) => string;
  "quizSession.advanced": string;
  "quizSession.mastered": string;
  "quizSession.streak": (p: { n: string | number }) => string;
  "quizSession.reset": string;
  "quizSession.streakReset": string;
  "quizSession.showHint": string;
  "quizSession.retry": string;
  "quizSession.exit": string;

  "pos.verb": string;
  "pos.noun": string;
  "pos.adj": string;
  "pos.adv": string;
  "pos.phrase": string;
  "pos.other": string;

  "theme.claro": string;
  "theme.sepia": string;
  "theme.oscuro": string;
  "theme.ambar": string;

  "font.sm": string;
  "font.md": string;
  "font.lg": string;
  "font.xl": string;
}

const es: Dict = {
  "common.retry": "Reintentar",
  "common.back": "Atrás",
  "common.add": "Añadir",
  "common.next": "Siguiente",
  "common.saving": "Guardando...",
  "common.loading": "Cargando...",
  "common.finish": "Terminar",
  "common.backHome": "Volver al inicio",

  "gate.connecting": "Conectando con Telegram...",
  "auth.noSession": "No se pudo obtener la sesión de Telegram. Abre la app desde el bot @Lector.",
  "auth.failed": "Error de autenticación",
  "error.network": "No se pudo conectar con el servidor. Revisa tu conexión.",
  "error.unexpected": "Ocurrió un error inesperado",

  "lang.esOnly": "Solo español",

  "onboarding.welcome": "Bienvenido a Lector",
  "onboarding.subtitle": "Lectura extensiva en español, a tu ritmo.",
  "onboarding.level": "Tu nivel de español",
  "onboarding.explainLang": "Idioma de las explicaciones",
  "onboarding.topics": "Temas que te interesan",
  "onboarding.otherTopic": "Otro tema...",
  "onboarding.daily": "Lectura diaria",
  "onboarding.dailyToggle": "Enviarme un artículo cada día",
  "onboarding.time": "Hora",
  "onboarding.start": "Empezar a leer",
  "onboarding.saveError": "No se pudo guardar tu perfil",

  "home.settings": "Ajustes",
  "home.history": "Historial",
  "home.queuedBanner": ({ count }) =>
    `🗂️ ${count} ${plural("es", count, ["palabra", "palabras"])} en cola. ${
      count === 1 ? "Entrará" : "Entrarán"
    } en estudio al liberarse un lugar.`,
  "home.stat.articles": "Artículos",
  "home.stat.inProgress": "En progreso",
  "home.stat.learned": "Aprendidas",
  "home.queuedLink": ({ count }) => `🗂️ ${count} en cola`,
  "home.activeBank": "Tu banco activo",
  "home.seeAll": "Ver todo →",
  "home.emptyBank": "Aún no marcaste palabras. ¡Empieza a leer!",
  "home.practice": ({ count }) => `🧠 Practicar (${count})`,
  "home.newReading": "Nueva lectura",
  "home.generating": "Generando...",
  "home.generatingHint": "Puede tardar hasta 30 segundos...",
  "home.loadError": "No se pudieron cargar tus datos",
  "home.startError": "No se pudo generar la lectura",
  "home.progressLoading": "Cargando tu progreso...",

  "reading.loading": "Cargando artículo...",
  "reading.source": "Fuente:",
  "reading.hint":
    "Toca una palabra para marcarla. Toca la de al lado para unirlas en una frase. Mantén pulsado para marcar la oración entera.",
  "reading.marks": ({ count }) => `${count} ${plural("es", count, ["marca", "marcas"])}`,
  "reading.finish": "Terminé",
  "reading.analyzing": "Analizando...",
  "reading.loadError": "No se pudo cargar la lectura",
  "reading.analyzeError": "No se pudo analizar la lectura",

  "review.spinnerAnalyzing": "Analizando tus palabras y frases...",
  "review.title": "Tu análisis",
  "review.nothingMarked": "No marcaste nada en esta lectura. ¡Buen trabajo!",
  "review.whatYouMarked": "Lo que marcaste",
  "review.rare": "poco frecuente",
  "review.showContext": "Ver en contexto",
  "review.hideContext": "Ocultar el contexto",
  "review.save": "Guardar",
  "review.skip": "Omitir",
  "review.yourWords": "Tus palabras en este artículo",
  "review.wovenHint": ({ streak }) =>
    `Cada lectura sin volver a marcarlas te acerca a dominarlas (${streak} de ${streak}).`,
  "review.wovenHintSrs": "Cada lectura sin volver a marcarlas las espacia más en el tiempo.",
  "review.markedAgain": "Vuelta a marcar · vuelve pronto",
  "review.readyToMaster": "¡Lista para dominar!",
  "review.streakProgress": ({ filled, total }) => `${filled} / ${total} para dominarla`,
  "review.wovenNextIn": ({ days }) => (days <= 1 ? "Vuelve mañana" : `Vuelve en ${days} días`),
  "review.continue": "Continuar",
  "review.analyzeError": "No se pudo analizar tu lectura",
  "review.saveError": "No se pudo guardar tu progreso",

  "bank.tab.active": "En progreso",
  "bank.tab.queued": "En cola",
  "bank.tab.learned": "Aprendidas",
  "bank.tab.ignored": "Descartadas",
  "bank.title": "Tu banco de palabras",
  "bank.search": "Buscar palabra o traducción",
  "bank.loading": "Cargando palabras...",
  "bank.empty.active": "No hay palabras en progreso. ¡Marca palabras mientras lees!",
  "bank.empty.queued": "No hay palabras en cola. Se llena al superar tu límite de palabras en estudio.",
  "bank.empty.learned": "Aún no hay palabras aprendidas. Llegarán con la práctica.",
  "bank.empty.ignored": "No hay palabras descartadas.",
  "bank.noMatch": ({ query }) => `No hay palabras que coincidan con «${query}».`,
  "bank.encounters": ({ n, total }) => `Encuentros ${n}/${total}`,
  "bank.nextPractice.soon": "Repaso pronto",
  "bank.nextPractice.today": "Repaso hoy",
  "bank.nextPractice.tomorrow": "Repaso mañana",
  "bank.nextPractice.inDays": ({ count }) => `Repaso en ${count} días`,
  "bank.queuedNote":
    "En cola: entrará en estudio automáticamente cuando se libere un lugar, o actívala ahora mismo.",
  "bank.knowIt": "Ya la sé",
  "bank.discard": "Descartar",
  "bank.studyNow": "Estudiar ahora",
  "bank.practiceAgain": "Practicar de nuevo",
  "bank.loadError": "No se pudo cargar tu banco",
  "bank.updateError": "No se pudo actualizar la palabra",

  "history.backHome": "← Inicio",
  "history.empty": "Aún no terminaste ninguna lectura. ¡Tu historial aparecerá aquí!",
  "history.wordsCount": ({ count }) => `${count} ${plural("es", count, ["palabra", "palabras"])}`,
  "history.sentsCount": ({ count }) => `${count} ${plural("es", count, ["frase", "frases"])}`,
  "history.loadMore": "Mostrar más",
  "history.loading": "Cargando tu historial...",
  "history.loadError": "No se pudo cargar tu historial",

  "historyArticle.back": "← Historial",
  "historyArticle.readOn": ({ date }) => `Leído el ${date}`,
  "historyArticle.loadError": "No se pudo cargar el artículo",
  "historyArticle.words": "Palabras",
  "historyArticle.phrases": "Frases",

  "settings.language": "Idioma",
  "settings.languageNote": "Idioma de la interfaz y de las explicaciones. Los artículos siempre están en español.",
  "settings.readingTheme": "Tema de lectura",
  "settings.textSize": "Tamaño del texto",
  "settings.level": "Nivel",
  "settings.topics": "Temas",
  "settings.addTopic": "Añadir tema...",
  "settings.removeTopic": "Quitar",
  "settings.botQuiz": "Quiz de vocabulario en el chat",
  "settings.quizzesPerDay": "Quizzes por día",
  "settings.less": "Menos",
  "settings.more": "Más",
  "settings.quizOff": "Desactivado. El bot no enviará quizzes.",
  "settings.quizOn": ({ count }) =>
    `El bot te enviará ${count} ${plural("es", count, ["quiz", "quizzes"])} entre las 09:00 y las 21:00.`,
  "settings.pool": "Palabras en estudio",
  "settings.poolUnlimited": "Sin límite",
  "settings.poolNoLimitNote": "Sin límite: todas las palabras que guardes entran en estudio.",
  "settings.poolLimitNote": ({ count }) =>
    `Mantendrás hasta ${count} palabras en estudio a la vez. Las demás esperan en cola y entran a medida que dominas o descartas otras.`,
  "settings.saved": "Guardado",
  "settings.saveChanges": "Guardar cambios",
  "settings.saveError": "No se pudo guardar",
  "settings.reset": "Restablecer progreso",
  "settings.resetting": "Reiniciando...",
  "settings.resetConfirm":
    "Esto borrará tu banco de palabras, tus artículos y tus estadísticas. Esta acción no se puede deshacer.",
  "settings.resetConfirmYes": "Sí, reiniciar",
  "settings.resetError": "No se pudo reiniciar el progreso",

  "quiz.title": "Quiz rápido",
  "practice.title": "Práctica",
  "practice.loading": "Preparando tu práctica...",
  "practice.loadError": "No se pudo cargar la práctica",
  "practice.emptyTitle": "Nada que practicar por ahora",
  "practice.emptyBody":
    "Las palabras aparecen aquí cuando les toca repaso. ¡Sigue leyendo para llenar tu banco!",
  "practice.writeSentence": ({ lemma }) => `✍️ Escribir una frase con «${lemma}»`,
  "practice.writePlaceholder": ({ lemma }) => `Escribe una frase usando «${lemma}»...`,
  "practice.check": "Revisar",
  "practice.checking": "Revisando...",
  "practice.better": "Mejor:",
  "practice.checkError": "No se pudo revisar la frase",

  "quizSession.completa": "Completa la frase:",
  "quizSession.howSay": "¿Cómo se dice...?",
  "quizSession.pending": ({ count }) => `· ${count} pendientes`,
  "quizSession.result": ({ correct, total }) => `Acertaste ${correct} de ${total}`,
  "quizSession.advanced": "Avanzaron",
  "quizSession.mastered": "¡dominada! 🏆",
  "quizSession.streak": ({ n }) => `racha ${n}`,
  "quizSession.reset": "Volverán antes",
  "quizSession.streakReset": "vuelve antes",
  "quizSession.showHint": "Mostrar traducción",
  "quizSession.retry": "repaso",
  "quizSession.exit": "Terminar",

  "pos.verb": "verbo",
  "pos.noun": "sustantivo",
  "pos.adj": "adjetivo",
  "pos.adv": "adverbio",
  "pos.phrase": "frase",
  "pos.other": "palabra",

  "theme.claro": "Claro",
  "theme.sepia": "Sepia",
  "theme.oscuro": "Oscuro suave",
  "theme.ambar": "Ámbar nocturno",

  "font.sm": "Pequeño",
  "font.md": "Normal",
  "font.lg": "Grande",
  "font.xl": "Muy grande",
};

const ru: Dict = {
  "common.retry": "Повторить",
  "common.back": "Назад",
  "common.add": "Добавить",
  "common.next": "Далее",
  "common.saving": "Сохранение...",
  "common.loading": "Загрузка...",
  "common.finish": "Готово",
  "common.backHome": "На главную",

  "gate.connecting": "Подключение к Telegram...",
  "auth.noSession": "Не удалось получить сессию Telegram. Откройте приложение через бота @Lector.",
  "auth.failed": "Ошибка авторизации",
  "error.network": "Не удалось подключиться к серверу. Проверьте соединение.",
  "error.unexpected": "Произошла непредвиденная ошибка",

  "lang.esOnly": "Только испанский",

  "onboarding.welcome": "Добро пожаловать в Lector",
  "onboarding.subtitle": "Много читаем по-испански — в своём темпе.",
  "onboarding.level": "Ваш уровень испанского",
  "onboarding.explainLang": "Язык объяснений",
  "onboarding.topics": "Интересные вам темы",
  "onboarding.otherTopic": "Другая тема...",
  "onboarding.daily": "Ежедневное чтение",
  "onboarding.dailyToggle": "Присылать мне статью каждый день",
  "onboarding.time": "Время",
  "onboarding.start": "Начать читать",
  "onboarding.saveError": "Не удалось сохранить профиль",

  "home.settings": "Настройки",
  "home.history": "История",
  "home.queuedBanner": ({ count }) =>
    `🗂️ ${count} ${plural("ru", count, ["слово", "слова", "слов"])} в очереди. ${
      plural("ru", count, ["Оно войдёт", "Они войдут", "Они войдут"])
    } в изучение, когда освободится место.`,
  "home.stat.articles": "Статьи",
  "home.stat.inProgress": "В процессе",
  "home.stat.learned": "Выучено",
  "home.queuedLink": ({ count }) => `🗂️ ${count} в очереди`,
  "home.activeBank": "Ваш активный банк",
  "home.seeAll": "Показать всё →",
  "home.emptyBank": "Вы ещё не отметили слов. Начните читать!",
  "home.practice": ({ count }) => `🧠 Тренировка (${count})`,
  "home.newReading": "Новое чтение",
  "home.generating": "Генерация...",
  "home.generatingHint": "Это может занять до 30 секунд...",
  "home.loadError": "Не удалось загрузить ваши данные",
  "home.startError": "Не удалось создать чтение",
  "home.progressLoading": "Загрузка вашего прогресса...",

  "reading.loading": "Загрузка статьи...",
  "reading.source": "Источник:",
  "reading.hint":
    "Коснитесь слова, чтобы отметить его. Коснитесь соседнего, чтобы объединить их во фразу. Удерживайте, чтобы отметить всё предложение.",
  "reading.marks": ({ count }) => `${count} ${plural("ru", count, ["метка", "метки", "меток"])}`,
  "reading.finish": "Готово",
  "reading.analyzing": "Анализ...",
  "reading.loadError": "Не удалось загрузить чтение",
  "reading.analyzeError": "Не удалось проанализировать чтение",

  "review.spinnerAnalyzing": "Анализируем ваши слова и фразы...",
  "review.title": "Ваш разбор",
  "review.nothingMarked": "Вы ничего не отметили в этом чтении. Отличная работа!",
  "review.whatYouMarked": "Что вы отметили",
  "review.rare": "редкое",
  "review.showContext": "Показать в контексте",
  "review.hideContext": "Скрыть контекст",
  "review.save": "Сохранить",
  "review.skip": "Пропустить",
  "review.yourWords": "Ваши слова в этой статье",
  "review.wovenHint": ({ streak }) =>
    `Каждое чтение без повторной отметки приближает вас к их освоению (${streak} из ${streak}).`,
  "review.wovenHintSrs": "Каждое чтение без повторной отметки отодвигает слово дальше по времени.",
  "review.markedAgain": "Отмечено снова · скоро вернётся",
  "review.readyToMaster": "Готово к освоению!",
  "review.streakProgress": ({ filled, total }) => `${filled} / ${total} до освоения`,
  "review.wovenNextIn": ({ days }) => (days <= 1 ? "Вернётся завтра" : `Вернётся через ${days} дн.`),
  "review.continue": "Продолжить",
  "review.analyzeError": "Не удалось проанализировать ваше чтение",
  "review.saveError": "Не удалось сохранить ваш прогресс",

  "bank.tab.active": "В процессе",
  "bank.tab.queued": "В очереди",
  "bank.tab.learned": "Выученные",
  "bank.tab.ignored": "Отклонённые",
  "bank.title": "Ваш банк слов",
  "bank.search": "Искать слово или перевод",
  "bank.loading": "Загрузка слов...",
  "bank.empty.active": "Нет слов в процессе. Отмечайте слова во время чтения!",
  "bank.empty.queued": "Нет слов в очереди. Она заполняется, когда превышен лимит слов в изучении.",
  "bank.empty.learned": "Пока нет выученных слов. Они появятся с практикой.",
  "bank.empty.ignored": "Нет отклонённых слов.",
  "bank.noMatch": ({ query }) => `Нет слов, совпадающих с «${query}».`,
  "bank.encounters": ({ n, total }) => `Встречи ${n}/${total}`,
  "bank.nextPractice.soon": "Повтор скоро",
  "bank.nextPractice.today": "Повтор сегодня",
  "bank.nextPractice.tomorrow": "Повтор завтра",
  "bank.nextPractice.inDays": ({ count }) =>
    `Повтор через ${count} ${plural("ru", count, ["день", "дня", "дней"])}`,
  "bank.queuedNote":
    "В очереди: слово войдёт в изучение автоматически, когда освободится место, или активируйте его прямо сейчас.",
  "bank.knowIt": "Уже знаю",
  "bank.discard": "Отклонить",
  "bank.studyNow": "Изучать сейчас",
  "bank.practiceAgain": "Тренировать снова",
  "bank.loadError": "Не удалось загрузить ваш банк",
  "bank.updateError": "Не удалось обновить слово",

  "history.backHome": "← На главную",
  "history.empty": "Вы ещё не завершили ни одного чтения. Ваша история появится здесь!",
  "history.wordsCount": ({ count }) => `${count} ${plural("ru", count, ["слово", "слова", "слов"])}`,
  "history.sentsCount": ({ count }) => `${count} ${plural("ru", count, ["фраза", "фразы", "фраз"])}`,
  "history.loadMore": "Показать ещё",
  "history.loading": "Загрузка вашей истории...",
  "history.loadError": "Не удалось загрузить вашу историю",

  "historyArticle.back": "← История",
  "historyArticle.readOn": ({ date }) => `Прочитано ${date}`,
  "historyArticle.loadError": "Не удалось загрузить статью",
  "historyArticle.words": "Слова",
  "historyArticle.phrases": "Фразы",

  "settings.language": "Язык",
  "settings.languageNote": "Язык интерфейса и объяснений. Статьи всегда на испанском.",
  "settings.readingTheme": "Тема чтения",
  "settings.textSize": "Размер текста",
  "settings.level": "Уровень",
  "settings.topics": "Темы",
  "settings.addTopic": "Добавить тему...",
  "settings.removeTopic": "Убрать",
  "settings.botQuiz": "Викторина по словам в чате",
  "settings.quizzesPerDay": "Викторин в день",
  "settings.less": "Меньше",
  "settings.more": "Больше",
  "settings.quizOff": "Отключено. Бот не будет присылать викторины.",
  "settings.quizOn": ({ count }) =>
    `Бот пришлёт вам ${count} ${plural("ru", count, ["викторину", "викторины", "викторин"])} между 09:00 и 21:00.`,
  "settings.pool": "Слов в изучении",
  "settings.poolUnlimited": "Без лимита",
  "settings.poolNoLimitNote": "Без лимита: все сохранённые слова входят в изучение.",
  "settings.poolLimitNote": ({ count }) =>
    `Одновременно в изучении будет до ${count} слов. Остальные ждут в очереди и входят по мере того, как вы осваиваете или отклоняете другие.`,
  "settings.saved": "Сохранено",
  "settings.saveChanges": "Сохранить изменения",
  "settings.saveError": "Не удалось сохранить",
  "settings.reset": "Сбросить прогресс",
  "settings.resetting": "Сброс...",
  "settings.resetConfirm":
    "Это удалит ваш банк слов, ваши статьи и статистику. Это действие нельзя отменить.",
  "settings.resetConfirmYes": "Да, сбросить",
  "settings.resetError": "Не удалось сбросить прогресс",

  "quiz.title": "Быстрая викторина",
  "practice.title": "Тренировка",
  "practice.loading": "Готовим вашу тренировку...",
  "practice.loadError": "Не удалось загрузить тренировку",
  "practice.emptyTitle": "Пока нечего тренировать",
  "practice.emptyBody":
    "Слова появляются здесь, когда им пора на повтор. Продолжайте читать, чтобы наполнить свой банк!",
  "practice.writeSentence": ({ lemma }) => `✍️ Написать фразу со словом «${lemma}»`,
  "practice.writePlaceholder": ({ lemma }) => `Напишите фразу со словом «${lemma}»...`,
  "practice.check": "Проверить",
  "practice.checking": "Проверка...",
  "practice.better": "Лучше:",
  "practice.checkError": "Не удалось проверить фразу",

  "quizSession.completa": "Дополните фразу:",
  "quizSession.howSay": "Как сказать...?",
  "quizSession.pending": ({ count }) => `· ещё ${count}`,
  "quizSession.result": ({ correct, total }) => `Верно ${correct} из ${total}`,
  "quizSession.advanced": "Продвинулись",
  "quizSession.mastered": "освоено! 🏆",
  "quizSession.streak": ({ n }) => `серия ${n}`,
  "quizSession.reset": "Повторим раньше",
  "quizSession.streakReset": "повторим раньше",
  "quizSession.showHint": "Показать перевод",
  "quizSession.retry": "повтор",
  "quizSession.exit": "Завершить",

  "pos.verb": "глагол",
  "pos.noun": "сущ.",
  "pos.adj": "прил.",
  "pos.adv": "нареч.",
  "pos.phrase": "фраза",
  "pos.other": "слово",

  "theme.claro": "Светлая",
  "theme.sepia": "Сепия",
  "theme.oscuro": "Мягкая тёмная",
  "theme.ambar": "Ночной янтарь",

  "font.sm": "Мелкий",
  "font.md": "Обычный",
  "font.lg": "Крупный",
  "font.xl": "Очень крупный",
};

const en: Dict = {
  "common.retry": "Retry",
  "common.back": "Back",
  "common.add": "Add",
  "common.next": "Next",
  "common.saving": "Saving...",
  "common.loading": "Loading...",
  "common.finish": "Finish",
  "common.backHome": "Back to home",

  "gate.connecting": "Connecting to Telegram...",
  "auth.noSession": "Couldn't get your Telegram session. Open the app from the @Lector bot.",
  "auth.failed": "Authentication error",
  "error.network": "Couldn't reach the server. Check your connection.",
  "error.unexpected": "Something went wrong",

  "lang.esOnly": "Spanish only",

  "onboarding.welcome": "Welcome to Lector",
  "onboarding.subtitle": "Extensive reading in Spanish, at your own pace.",
  "onboarding.level": "Your Spanish level",
  "onboarding.explainLang": "Language of explanations",
  "onboarding.topics": "Topics you're interested in",
  "onboarding.otherTopic": "Other topic...",
  "onboarding.daily": "Daily reading",
  "onboarding.dailyToggle": "Send me an article every day",
  "onboarding.time": "Time",
  "onboarding.start": "Start reading",
  "onboarding.saveError": "Couldn't save your profile",

  "home.settings": "Settings",
  "home.history": "History",
  "home.queuedBanner": ({ count }) =>
    `🗂️ ${count} ${plural("en", count, ["word", "words"])} queued. ${
      count === 1 ? "It will enter" : "They will enter"
    } study once a spot frees up.`,
  "home.stat.articles": "Articles",
  "home.stat.inProgress": "In progress",
  "home.stat.learned": "Learned",
  "home.queuedLink": ({ count }) => `🗂️ ${count} queued`,
  "home.activeBank": "Your active bank",
  "home.seeAll": "See all →",
  "home.emptyBank": "You haven't marked any words yet. Start reading!",
  "home.practice": ({ count }) => `🧠 Practice (${count})`,
  "home.newReading": "New reading",
  "home.generating": "Generating...",
  "home.generatingHint": "This can take up to 30 seconds...",
  "home.loadError": "Couldn't load your data",
  "home.startError": "Couldn't generate the reading",
  "home.progressLoading": "Loading your progress...",

  "reading.loading": "Loading article...",
  "reading.source": "Source:",
  "reading.hint":
    "Tap a word to mark it. Tap the next one to join them into a phrase. Press and hold to mark the whole sentence.",
  "reading.marks": ({ count }) => `${count} ${plural("en", count, ["mark", "marks"])}`,
  "reading.finish": "Done",
  "reading.analyzing": "Analyzing...",
  "reading.loadError": "Couldn't load the reading",
  "reading.analyzeError": "Couldn't analyze the reading",

  "review.spinnerAnalyzing": "Analyzing your words and phrases...",
  "review.title": "Your review",
  "review.nothingMarked": "You didn't mark anything in this reading. Nice work!",
  "review.whatYouMarked": "What you marked",
  "review.rare": "uncommon",
  "review.showContext": "See in context",
  "review.hideContext": "Hide context",
  "review.save": "Save",
  "review.skip": "Skip",
  "review.yourWords": "Your words in this article",
  "review.wovenHint": ({ streak }) =>
    `Each reading without marking them again brings you closer to mastering them (${streak} of ${streak}).`,
  "review.wovenHintSrs": "Each reading without re-marking spaces the word out further.",
  "review.markedAgain": "Marked again · back soon",
  "review.readyToMaster": "Ready to master!",
  "review.streakProgress": ({ filled, total }) => `${filled} / ${total} to master it`,
  "review.wovenNextIn": ({ days }) => (days <= 1 ? "Back tomorrow" : `Back in ${days} days`),
  "review.continue": "Continue",
  "review.analyzeError": "Couldn't analyze your reading",
  "review.saveError": "Couldn't save your progress",

  "bank.tab.active": "In progress",
  "bank.tab.queued": "Queued",
  "bank.tab.learned": "Learned",
  "bank.tab.ignored": "Discarded",
  "bank.title": "Your word bank",
  "bank.search": "Search word or translation",
  "bank.loading": "Loading words...",
  "bank.empty.active": "No words in progress. Mark words while you read!",
  "bank.empty.queued": "No words queued. It fills up when you exceed your study limit.",
  "bank.empty.learned": "No learned words yet. They'll come with practice.",
  "bank.empty.ignored": "No discarded words.",
  "bank.noMatch": ({ query }) => `No words match «${query}».`,
  "bank.encounters": ({ n, total }) => `Encounters ${n}/${total}`,
  "bank.nextPractice.soon": "Review soon",
  "bank.nextPractice.today": "Review today",
  "bank.nextPractice.tomorrow": "Review tomorrow",
  "bank.nextPractice.inDays": ({ count }) =>
    `Review in ${count} ${plural("en", count, ["day", "days"])}`,
  "bank.queuedNote":
    "Queued: it will enter study automatically when a spot frees up, or activate it right now.",
  "bank.knowIt": "I know it",
  "bank.discard": "Discard",
  "bank.studyNow": "Study now",
  "bank.practiceAgain": "Practice again",
  "bank.loadError": "Couldn't load your bank",
  "bank.updateError": "Couldn't update the word",

  "history.backHome": "← Home",
  "history.empty": "You haven't finished any reading yet. Your history will appear here!",
  "history.wordsCount": ({ count }) => `${count} ${plural("en", count, ["word", "words"])}`,
  "history.sentsCount": ({ count }) => `${count} ${plural("en", count, ["sentence", "sentences"])}`,
  "history.loadMore": "Show more",
  "history.loading": "Loading your history...",
  "history.loadError": "Couldn't load your history",

  "historyArticle.back": "← History",
  "historyArticle.readOn": ({ date }) => `Read on ${date}`,
  "historyArticle.loadError": "Couldn't load the article",
  "historyArticle.words": "Words",
  "historyArticle.phrases": "Phrases",

  "settings.language": "Language",
  "settings.languageNote": "Language of the interface and explanations. Articles are always in Spanish.",
  "settings.readingTheme": "Reading theme",
  "settings.textSize": "Text size",
  "settings.level": "Level",
  "settings.topics": "Topics",
  "settings.addTopic": "Add topic...",
  "settings.removeTopic": "Remove",
  "settings.botQuiz": "Vocabulary quiz in chat",
  "settings.quizzesPerDay": "Quizzes per day",
  "settings.less": "Less",
  "settings.more": "More",
  "settings.quizOff": "Disabled. The bot won't send quizzes.",
  "settings.quizOn": ({ count }) =>
    `The bot will send you ${count} ${plural("en", count, ["quiz", "quizzes"])} between 09:00 and 21:00.`,
  "settings.pool": "Words in study",
  "settings.poolUnlimited": "No limit",
  "settings.poolNoLimitNote": "No limit: every word you save enters study.",
  "settings.poolLimitNote": ({ count }) =>
    `You'll keep up to ${count} words in study at a time. The rest wait in the queue and enter as you master or discard others.`,
  "settings.saved": "Saved",
  "settings.saveChanges": "Save changes",
  "settings.saveError": "Couldn't save",
  "settings.reset": "Reset progress",
  "settings.resetting": "Resetting...",
  "settings.resetConfirm":
    "This will erase your word bank, your articles and your stats. This action can't be undone.",
  "settings.resetConfirmYes": "Yes, reset",
  "settings.resetError": "Couldn't reset progress",

  "quiz.title": "Quick quiz",
  "practice.title": "Practice",
  "practice.loading": "Preparing your practice...",
  "practice.loadError": "Couldn't load practice",
  "practice.emptyTitle": "Nothing to practice right now",
  "practice.emptyBody":
    "Words appear here when they're due for review. Keep reading to fill your bank!",
  "practice.writeSentence": ({ lemma }) => `✍️ Write a sentence with «${lemma}»`,
  "practice.writePlaceholder": ({ lemma }) => `Write a sentence using «${lemma}»...`,
  "practice.check": "Check",
  "practice.checking": "Checking...",
  "practice.better": "Better:",
  "practice.checkError": "Couldn't check the sentence",

  "quizSession.completa": "Complete the sentence:",
  "quizSession.howSay": "How do you say...?",
  "quizSession.pending": ({ count }) => `· ${count} pending`,
  "quizSession.result": ({ correct, total }) => `You got ${correct} of ${total}`,
  "quizSession.advanced": "Advanced",
  "quizSession.mastered": "mastered! 🏆",
  "quizSession.streak": ({ n }) => `streak ${n}`,
  "quizSession.reset": "Coming back sooner",
  "quizSession.streakReset": "back sooner",
  "quizSession.showHint": "Show translation",
  "quizSession.retry": "retry",
  "quizSession.exit": "Finish",

  "pos.verb": "verb",
  "pos.noun": "noun",
  "pos.adj": "adjective",
  "pos.adv": "adverb",
  "pos.phrase": "phrase",
  "pos.other": "word",

  "theme.claro": "Light",
  "theme.sepia": "Sepia",
  "theme.oscuro": "Soft dark",
  "theme.ambar": "Night amber",

  "font.sm": "Small",
  "font.md": "Normal",
  "font.lg": "Large",
  "font.xl": "Extra large",
};

const DICT: Record<Lang, Dict> = { ru, en, es };

/** Fills `{name}` placeholders in a plain-string entry. */
function interpolate(template: string, params: Record<string, Primitive>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

/**
 * Translate a chrome key into the given language. Function entries receive the
 * params object; plain strings interpolate `{name}` placeholders from params.
 */
export function t<K extends keyof Dict>(
  lang: Lang,
  key: K,
  params?: Dict[K] extends (p: infer P) => string ? P : Record<string, Primitive>,
): string {
  const entry = DICT[lang][key];
  if (typeof entry === "function") return entry(params as never);
  return params ? interpolate(entry, params as Record<string, Primitive>) : entry;
}

/**
 * Hook binding `t` to the signed-in user's `explainLang`. Before a profile
 * exists (auth gate) it falls back to the Telegram-derived initial language.
 */
export function useT(): {
  lang: Lang;
  t: <K extends keyof Dict>(
    key: K,
    params?: Dict[K] extends (p: infer P) => string ? P : Record<string, Primitive>,
  ) => string;
} {
  const { profile } = useAuth();
  const lang = profile?.explainLang ?? initialLang();
  return { lang, t: (key, params) => t(lang, key, params as never) };
}
