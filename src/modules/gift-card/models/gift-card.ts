import { model } from "@medusajs/framework/utils";

/**
 * Eine Geschenkkarte (Mehrzweckgutschein).
 *
 * Beträge in Cent als ganze Zahl (2500 = 25,00 €). So lässt sich das
 * Guthaben später mit einem einzigen, gesperrten Datenbankbefehl abbuchen
 * – wie die Nummernvergabe bei den Rechnungen.
 */
export const GiftCard = model.define("gift_card", {
  id: model.id({ prefix: "gcard" }).primaryKey(),

  // Der Code, der auf der Karte steht, z. B. "GK-7KQM-R4XT-9HWP".
  // unique() lässt die Datenbank einen doppelten Code ablehnen.
  code: model.text().unique(),

  // Wert beim Kauf und was davon noch übrig ist.
  initial_amount_cents: model.number(),
  balance_cents: model.number(),
  currency_code: model.text(),

  // Mit welcher Bestellung die Karte gekauft wurde. Leer bei Karten, die
  // im Admin von Hand angelegt werden (z. B. als Kulanz).
  order_id: model.text().nullable(),

  // Ende der Gültigkeit. Leer = unbegrenzt gültig.
  expires_at: model.dateTime().nullable(),

  // Gesperrt, z. B. wenn eine Karte als verloren gemeldet wurde.
  is_disabled: model.boolean().default(false),
});
