import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { bootstrapTelegram } from "./telegram/telegram.js";
import "./index.css";

bootstrapTelegram();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
