import de from "../locales/de.json";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import nl from "../locales/nl.json";

export const messages = {
  de,
  en,
  fr,
  nl,
} as const;

export type Lang = keyof typeof messages

export const getMessages = (lang: Lang) => messages[lang]