import { model } from "@medusajs/framework/utils";

/**
 * Eine Einlösung: Welche Karte wurde bei welcher Bestellung mit wie viel
 * belastet? Positiver Betrag = eingelöst, negativer = zurückgebucht
 * (z. B. wenn die Bestellung storniert wird).
 *
 * Damit lässt sich jederzeit nachvollziehen, wo das Guthaben geblieben ist.
 */
export const GiftCardRedemption = model.define("gift_card_redemption", {
  id: model.id({ prefix: "gcred" }).primaryKey(),
  gift_card_id: model.text().index(),
  
  // Bei welchem Warenkorb abgebucht wurde. Beim Abbuchen gibt es die
  // Bestellung noch nicht – order_id wird gleich danach nachgetragen.
  // Über cart_id erkennen wir außerdem, ob für einen Warenkorb schon
  // abgebucht wurde, falls der Bestellabschluss zweimal läuft.
  cart_id: model.text().index().nullable(),

  order_id: model.text().nullable(),
  amount_cents: model.number(),
});
