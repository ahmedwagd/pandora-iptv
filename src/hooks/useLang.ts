import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
const KEY = "panora:lang";
export function useLang() {
  const [lang, setLang] = useState<Lang>(()=> (localStorage.getItem(KEY) as Lang) || "en");
  useEffect(()=> {
    localStorage.setItem(KEY, lang);
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  }, [lang]);
  return { lang, setLang } as const;
}
