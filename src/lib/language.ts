import {
  FALLBACK_LANG,
  isLang,
  localeToLang,
  type Lang,
} from "../admin/lib/languages";

// Die Liste liegt unter src/admin, damit die Admin-Oberfläche sie laden
// kann. Von hier aus ist sie auch fürs Backend erreichbar.
export { LANGUAGES, isLang, localeToLang, langToLocale } from "../admin/lib/languages";
export type { Lang } from "../admin/lib/languages";

/**
 * Die Hauptsprache des Shops – die im Admin unter „E-Mail-Einstellungen"
 * gewählte Sprache.
 *
 * Sie gilt, wenn zu einem Vorgang gar keine Sprache bekannt ist, etwa bei
 * einer Passwort-Mail, die zu keiner Bestellung gehört. Ist auch sie nicht
 * gesetzt, bleibt Englisch.
 */
export const shopLanguage = (
  metadata: Record<string, unknown> | null | undefined
): Lang => {
  const configured = metadata?.email_locale;
  return isLang(configured) ? configured : FALLBACK_LANG;
};

/**
 * Die Sprache eines Vorgangs: die der Bestellung, sonst die Hauptsprache
 * des Shops. Eine nicht angebotene Sprache wird zu Englisch.
 */
export const contentLanguage = (
  locale: unknown,
  metadata: Record<string, unknown> | null | undefined
): Lang =>
  typeof locale === "string" && locale ? localeToLang(locale) : shopLanguage(metadata);
