import { ExecArgs } from "@medusajs/framework/types";
import { INVOICE_MODULE } from "../modules/invoice";
import { sendInvoiceMail } from "../lib/invoice/send-invoice-mail";

/**
 * Verschickt die neueste noch nicht verschickte Stornorechnung und sagt,
 * was dabei passiert ist.
 *
 * Läuft in einem eigenen Prozess mit dem aktuellen Code – damit fällt die
 * Frage weg, ob der laufende Server die Änderungen schon kennt.
 *
 * Aufruf:  npx medusa exec ./src/scripts/test-invoice-mail.ts
 */
export default async function ({ container }: ExecArgs) {
  const invoiceService: any = container.resolve(INVOICE_MODULE);

  const [doc] = await invoiceService.listInvoices(
    { type: "cancellation" },
    { order: { created_at: "DESC" }, take: 1 }
  );

  if (!doc) {
    console.log("Kein Storno gefunden.");
    return;
  }

  console.log("");
  console.log(`Dokument:      ${doc.number}`);
  console.log(`Datei:         ${doc.pdf_filename ?? "(keine)"}`);
  console.log(`Schon gesendet: ${doc.mailed_at ? "ja" : "nein"}`);
  console.log("");

  const result = await sendInvoiceMail({ container, invoiceId: doc.id });

  console.log(
    result.sent
      ? "ERGEBNIS: verschickt."
      : `ERGEBNIS: NICHT verschickt – ${result.reason}`
  );
}
