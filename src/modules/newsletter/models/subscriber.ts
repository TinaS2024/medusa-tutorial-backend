import { model } from "@medusajs/framework/utils";

export const NewsletterSubscriber = model.define("newsletter_subscriber", {
  id: model.id().primaryKey(),
  email: model.text().unique(),

  // pending = eingetragen, aber noch nicht bestätigt (Double-Opt-in)
  // confirmed = bestätigt, darf angeschrieben werden
  // unsubscribed = abgemeldet, bleibt als Nachweis erhalten
  status: model.enum(["pending", "confirmed", "unsubscribed"]).default("pending"),

  // Zufallswert für Bestätigungs- und Abmeldelink
  token: model.text(),

  locale: model.text().default("de"),

  // Zeitpunkt und Herkunft der Einwilligung – im Streitfall der Nachweis
  confirmed_at: model.dateTime().nullable(),
  source: model.text().nullable(),
})
