import { useState } from "react";

const KEY = "pandora-theme";

/** Apply the saved theme (defaults to light for the Daylight Broadcast polish). */
export function initTheme() {
  const saved = localStorage.getItem(KEY);
  const isLight = saved !== "dark";
  document.documentElement.dataset.theme = isLight ? "light" : "";
}

function apply(next: "light" | "dark") {
  document.documentElement.dataset.theme = next === "light" ? "light" : "";
  localStorage.setItem(KEY, next);
}

/** Sun/moon toggle that flips between the dark broadcast and daylight themes. */
export function ThemeToggle({ className }: { className?: string }) {
  const [light, setLight] = useState(
    () => document.documentElement.dataset.theme === "light"
  );

  const onClick = () => {
    const next = light ? "dark" : "light";
    apply(next);
    setLight(next === "light");
  };

  return (
    <button
      type="button"
      className={className ? `theme-toggle ${className}` : "theme-toggle"}
      onClick={onClick}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      title={light ? "Switch to dark theme" : "Switch to light theme"}
    >
      {light ? "☾" : "☀"}
    </button>
  );
}
