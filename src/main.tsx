import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/archivo";
import "@fontsource-variable/archivo-narrow";
import "@fontsource-variable/jetbrains-mono";
import App from "./App";
import "./index.css";
import "./light.css";
import { initTheme } from "./theme";

document.addEventListener("contextmenu", (e) => e.preventDefault());
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
