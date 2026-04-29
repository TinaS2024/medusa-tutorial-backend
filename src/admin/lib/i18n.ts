const FALLBACK_LANG = "de" as const;

const localeToLang = (locale?: string): "de" | "en" | "fr" | "nl" => {
  if (!locale) return FALLBACK_LANG;

  if (locale.startsWith("de")) return "de";
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("fr")) return "fr";
  if (locale.startsWith("nl")) return "nl";

  return FALLBACK_LANG;
}

export const getClientLanguage = (): "de" | "en" | "fr" | "nl" => {
  if (typeof window === "undefined") return FALLBACK_LANG;
  const stored = window.localStorage.getItem("ui_locale");
  return localeToLang(stored ?? undefined);
};