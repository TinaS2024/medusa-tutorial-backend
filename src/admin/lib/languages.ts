/**
 * Die Sprachen von Admin-Oberfläche und Backend (E-Mails, Rechtstexte,
 * Rechnungen) – die einzige Stelle, an der sie stehen.
 *
 * Liegt unter src/admin, weil die Admin-Oberfläche nur Dateien aus diesem
 * Ordner lädt. Das Backend holt sich die Liste von hier, so wie es auch
 * schon die Sprachdateien aus src/admin/locales lädt.
 *
 * Eine neue Sprache hinzufügen:
 *   1. hier eine Zeile ergänzen,
 *   2. src/admin/locales/en.json kopieren, umbenennen, übersetzen,
 *   3. die Datei in src/admin/lib/messages.ts eintragen,
 *   4. einen Block in src/lib/invoice/texts.ts ergänzen.
 * Fehlt Schritt 3 oder 4, meldet TypeScript das sofort.
 */
export const LANGUAGES = [
  { code: "de", locale: "de-DE", label: "Deutsch" },
  { code: "en", locale: "en-GB", label: "English" },
  { code: "fr", locale: "fr-FR", label: "Français" },
  { code: "nl", locale: "nl-NL", label: "Nederlands" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];

export const isLang = (value: unknown): value is Lang =>
  typeof value === "string" && LANGUAGES.some((language) => language.code === value);

/**
 * Für Sprachen, die nicht angeboten werden, und wenn gar keine bekannt ist.
 * Medusas eigene Oberfläche zeigt in diesem Fall ebenfalls Englisch.
 */
export const FALLBACK_LANG: Lang = "en";

/** "fr-FR", "fr" oder "FR" → "fr". Unbekannt oder leer → Englisch. */
export const localeToLang = (locale?: string | null): Lang => {
  const code = (locale ?? "").slice(0, 2).toLowerCase();
  return isLang(code) ? code : FALLBACK_LANG;
};

/** "de" → "de-DE" – für Datums- und Geldformate. */
export const langToLocale = (lang: string): string =>
  LANGUAGES.find((language) => language.code === lang)?.locale ?? "en-GB";
