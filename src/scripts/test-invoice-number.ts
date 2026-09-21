import { ExecArgs } from "@medusajs/framework/types";
import { INVOICE_MODULE } from "../modules/invoice";

/**
 * Wegwerf-Test für die Nummernvergabe.
 * Aufruf:  npx medusa exec ./src/scripts/test-invoice-number.ts
 */
export default async function ({ container }: ExecArgs) {
  const service: any = container.resolve(INVOICE_MODULE);

  // Fünf Nummern gleichzeitig ziehen – genau so, wie es bei fünf
  // Bestellungen im selben Moment passieren würde. Promise.all startet
  // alle fünf, ohne auf die vorherige zu warten.
  const numbers = await Promise.all([
    service.nextNumber("invoice"),
    service.nextNumber("invoice"),
    service.nextNumber("invoice"),
    service.nextNumber("invoice"),
    service.nextNumber("invoice"),
  ]);

  console.log("Gezogene Nummern:", numbers);

  const allDifferent = new Set(numbers).size === numbers.length;
  console.log(
    allDifferent
      ? "OK – alle Nummern verschieden, die Sperre hält."
      : "FEHLER – doppelte Nummer dabei!"
  );

  // Zähler wieder auf 0 setzen, damit die erste echte Rechnung die 1 bekommt.
  // Das ist NUR erlaubt, solange es noch keine einzige echte Rechnung gibt.
  // Im laufenden Betrieb wäre es ein schwerer Fehler.
  await service.updateInvoiceNumberSeries({ id: "invoice", last_number: 0 });
  console.log("Zähler wieder auf 0 gesetzt.");
}
