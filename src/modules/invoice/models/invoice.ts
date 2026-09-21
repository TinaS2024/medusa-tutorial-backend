import { model } from "@medusajs/framework/utils";

/**
 * Welche Art von Dokument ist das?
 *   invoice      = normale Rechnung
 *   cancellation = Stornorechnung, hebt eine Rechnung komplett auf
 *   credit_note  = Gutschrift, korrigiert eine Rechnung teilweise
 */
export const INVOICE_TYPES = ["invoice", "cancellation", "credit_note"] as const;

export const Invoice = model.define("invoice", {
  id: model.id().primaryKey(),

  // Die vergebene Nummer, z. B. "RE-000001". Wird nie geändert.
  // unique() lässt die Datenbank eine doppelte Nummer ablehnen – das ist
  // die letzte Sicherung, falls die Nummernsperre je versagen sollte.
  number: model.text().unique(),

  type: model.enum([...INVOICE_TYPES]).default("invoice"),

  // Zu welcher Bestellung gehört das Dokument?
  order_id: model.text().index(),

  // Nur bei Storno und Gutschrift: die id des Dokuments, das korrigiert wird.
  corrects_invoice_id: model.text().nullable(),

  // Pflichtangaben: Ausstellungsdatum und Zeitpunkt der Lieferung.
  issued_at: model.dateTime(),
  service_date: model.dateTime().nullable(),

  // Beträge. bigNumber ist der Medusa-Typ für Geld – er rechnet ohne
  // Rundungsfehler, anders als eine normale Kommazahl.
  currency_code: model.text(),
  total_net: model.bigNumber(),
  total_tax: model.bigNumber(),
  total_gross: model.bigNumber(),

  // Sprache, in der das PDF erzeugt wurde – kommt aus order.locale.
  locale: model.text().default("de"),

  // Platzhalter für B2B. Bleiben leer, bis wir Etappe 9 bauen.
  buyer_vat_id: model.text().nullable(),
  tax_note: model.text().nullable(),

  // Dateiname im Rechnungsverzeichnis, z. B. "RE-000001.pdf".
  pdf_filename: model.text().nullable(),

  // Wann die Rechnung per E-Mail an den Kunden ging. Leer = noch nie.
  mailed_at: model.dateTime().nullable(),

  // Die unveränderliche Kopie aller Daten, aus denen das PDF gebaut wurde:
  // Positionen, Preise, Steuersätze, Adressen, Firmendaten.
  snapshot: model.json(),
});
