import { useEffect, useState } from "react";
export type Theme = "dark" | "light" | "system";
const KEY = "panora:theme";
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme) || "dark");
  useEffect(() => {
    localStorage.setItem(KEY, theme);
    const root = document.documentElement;
    if (theme === "system") {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      root.setAttribute("data-theme", prefersLight ? "light" : "dark");
    } else root.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (theme !== "system") return;
    const m = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () =>
      document.documentElement.setAttribute("data-theme", m.matches ? "light" : "dark");
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [theme]);
  return { theme, setTheme } as const;
}
