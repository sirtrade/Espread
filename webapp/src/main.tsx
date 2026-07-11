import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { bootstrapTelegram } from "./telegram/telegram.js";
import { initTheme } from "./lib/theme.js";
import { initFontSize } from "./lib/fontSize.js";
import "./index.css";

bootstrapTelegram();
initTheme();
initFontSize();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
