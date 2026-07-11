import { Bot, InlineKeyboard } from "grammy";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { findOrCreateUser } from "../db/repositories/users.js";
import { registerQuizHandlers } from "./quiz.js";

export const bot = new Bot(config.BOT_TOKEN);

registerQuizHandlers(bot);

function openAppKeyboard(text: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (config.WEBAPP_URL) {
    kb.webApp(text, config.WEBAPP_URL);
  }
  return kb;
}

bot.command("start", async (ctx) => {
  if (!ctx.from) return;
  await findOrCreateUser(ctx.from.id, ctx.from.username);

  const message =
    "👋 ¡Bienvenido a *Lector*!\n\n" +
    "Lees artículos cortos en español a tu nivel y marcas las palabras o frases que no entiendes. " +
    "Esas palabras reaparecen, sin previo aviso, en tus próximas lecturas hasta que las domines. " +
    "Así aprendes vocabulario por repetición en contexto, no con tarjetas.\n\n" +
    "Toca el botón para empezar.";

  await ctx.reply(message, { parse_mode: "Markdown", reply_markup: openAppKeyboard("📖 Abrir Lector") });
});

bot.command("read", async (ctx) => {
  if (!ctx.from) return;
  await findOrCreateUser(ctx.from.id, ctx.from.username);
  await ctx.reply("Tu próxima lectura te espera 👇", { reply_markup: openAppKeyboard("📖 Leer ahora") });
});

bot.catch((err) => {
  logger.error({ err: err.error, ctx: err.ctx.update }, "grammY bot error");
});

export function startBot(): void {
  if (!config.WEBAPP_URL) {
    logger.warn("WEBAPP_URL is not set — bot buttons will have no web_app action");
  }
  // Polling failures (bad token, Telegram unreachable at boot) must not take
  // down the API server sharing this process — log and let the container's
  // health check / restart policy handle recovery instead of crashing here.
  bot.start({
    onStart: () => logger.info("Telegram bot polling started"),
  }).catch((err) => {
    logger.error({ err }, "Telegram bot failed to start (check BOT_TOKEN) — API server continues running");
  });
}

export { openAppKeyboard };
