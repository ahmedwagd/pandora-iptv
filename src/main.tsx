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

// Safety net: if React fails to mount, don't leave static splash forever.
// React SplashScreen removes #app-splash via rAF as soon as it mounts; this
// only fires if no React splash appears within 5s (e.g. bundle error).
if (typeof window !== "undefined") {
  window.setTimeout(() => {
    const el = document.getElementById("app-splash");
    if (el && !document.querySelector(".splash")) {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      el.style.transition = "opacity 320ms ease";
      window.setTimeout(() => el.remove(), 360);
    }
  }, 5000);
}
