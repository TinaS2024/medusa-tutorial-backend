import { model } from "@medusajs/framework/utils";

/**
 * Ein Nummernkreis. In dieser Tabelle stehen genau zwei Zeilen:
 *   "invoice"    – für Rechnungen
 *   "correction" – für Stornos und Gutschriften
 *
 * Die id ist bewusst kein Zufallswert, sondern der feste Name des Kreises.
 * Dadurch kann die Nummernvergabe die Zeile direkt ansprechen, ohne sie
 * vorher suchen zu müssen – und genau das brauchen wir für die Sperre.
 */
export const InvoiceNumberSeries = model.define("invoice_number_series", {
  id: model.text().primaryKey(),

  // Was vor der Nummer steht, z. B. "RE-" oder "GS-". Später im Admin änderbar.
  prefix: model.text().default(""),

  // Auf wie viele Stellen wird mit Nullen aufgefüllt? 6 ergibt "000001".
  pad_length: model.number().default(6),

  // Die zuletzt vergebene Nummer. Startet bei 0, die erste Rechnung wird 1.
  last_number: model.number().default(0),
});
