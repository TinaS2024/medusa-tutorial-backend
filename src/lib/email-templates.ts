import { getMessages } from "../admin/lib/messages";
import { LANGUAGES, localeToLang } from "../admin/lib/languages";

/** Die Sprachkürzel – für Schleifen über alle Sprachen. */
export const SPRACHEN = LANGUAGES.map((language) => language.code);

export const VORLAGEN = [
  "password_reset",
  "order_confirmation",
  "production_status_update",
] as const;

export type Vorlage = (typeof VORLAGEN)[number];

/**
 * Die mitgelieferte Vorlage aus den Sprachdateien.
 *
 * Über getMessages statt über einen eigenen Zugriff auf die JSON-Dateien:
 * Fehlt ein Feld in einer Sprache, kommt es aus der englischen Vorlage,
 * statt leer zu bleiben.
 */
export function standardVorlage(locale: string, name: Vorlage) {
  const templates = getMessages(localeToLang(locale)).email_templates as Record<
    string,
    any
  >;

  return templates?.[name] ?? {};
}

/**
 * Liefert die zu verwendende Vorlage: bevorzugt den im Admin hinterlegten
 * Text, sonst den mitgelieferten.
 *
 * Zusammengeführt wird feldweise – wer nur den Betreff anpasst, behält den
 * ursprünglichen Fließtext. Leere Felder gelten als "nicht überschrieben".
 */
export function getEmailTemplate(
  metadata: Record<string, unknown> | null | undefined,
  locale: string,
  name: Vorlage
) {
  const standard = standardVorlage(locale, name);
  const eigene = (metadata as any)?.email_templates_custom?.[locale]?.[name] ?? {};

  const ergebnis: Record<string, any> = { ...standard };

  for (const [feld, value] of Object.entries(eigene)) 
  {
    if (typeof value === "string" && value.trim().length > 0) 
    {
      ergebnis[feld] = value;
    }
  }

  return ergebnis;
}
