import de from "../admin/locales/de.json";
import en from "../admin/locales/en.json";
import fr from "../admin/locales/fr.json";
import nl from "../admin/locales/nl.json";

const vorlagenNachSprache: Record<string, any> = { de, en, fr, nl };

export const SPRACHEN = ["de", "en", "fr", "nl"] as const;
export const VORLAGEN = [
  "password_reset",
  "order_confirmation",
  "production_status_update",
] as const;

export type Vorlage = (typeof VORLAGEN)[number];

/** Die mitgelieferte Vorlage aus den Sprachdateien. */
export function standardVorlage(locale: string, name: Vorlage) 
{
  return vorlagenNachSprache[locale]?.email_templates?.[name] ?? {};
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

  for (const [feld, wert] of Object.entries(eigene)) 
  {
    if (typeof wert === "string" && wert.trim().length > 0) 
    {
      ergebnis[feld] = wert;
    }
  }

  return ergebnis;
}
