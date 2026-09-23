import { localeToLang, type Lang } from "./languages";

export const getClientLanguage = (): Lang => {
  if (typeof window === "undefined") return localeToLang(null);

  // lng ist Medusas eigener Sprachschlüssel – er folgt der Sprache, die
  // oben rechts im Admin eingestellt ist.
  const stored =
    window.localStorage.getItem("lng") ?? window.localStorage.getItem("ui_locale");

  return localeToLang(stored);
};
