import de from "../locales/de.json";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import nl from "../locales/nl.json";

import type { Lang } from "./languages";

export type { Lang } from "./languages";

/** Der Aufbau aller Sprachdateien. Die englische ist die Vorlage. */
export type Messages = typeof en;

/**
 * Eine Datei je Sprache aus languages.ts. Record<Lang, …> verlangt jeden
 * Eintrag – fehlt einer, meldet TypeScript das hier.
 */
const FILES: Record<Lang, unknown> = { de, en, fr, nl };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Legt eine Sprachdatei über die englische Vorlage. Was fehlt oder leer
 * ist, kommt aus der Vorlage – eine halb übersetzte neue Sprache zeigt
 * dann englische Texte statt leerer Stellen.
 */
const fillGaps = (base: unknown, override: unknown): unknown => {
  if (isObject(base) && isObject(override)) {
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(override)) {
      result[key] = fillGaps(base[key], override[key]);
    }
    return result;
  }

  return override === undefined || override === null || override === "" ? base : override;
};

const cache = new Map<Lang, Messages>();

export const getMessages = (lang: Lang): Messages => {
  const cached = cache.get(lang);
  if (cached) return cached;

  const merged = fillGaps(en, FILES[lang]) as Messages;
  cache.set(lang, merged);
  return merged;
};
