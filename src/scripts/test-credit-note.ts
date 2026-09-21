import { ExecArgs } from "@medusajs/framework/types";
import { INVOICE_MODULE } from "../modules/invoice";
import { createCreditNote } from "../lib/invoice/create-credit-note";

/**
 * Schreibt Position 1 der neuesten gültigen Rechnung gut.
 * Aufruf:  npx medusa exec ./src/scripts/test-credit-note.ts
 */
export default async function ({ container }: ExecArgs) {
  const invoiceService: any = container.resolve(INVOICE_MODULE);

  const all = await invoiceService.listInvoices({}, { order: { created_at: "DESC" } });

  const cancelledIds = new Set(
    all
      .filter((i: any) => i.type === "cancellation")
      .map((i: any) => i.corrects_invoice_id)
  );

  const invoice = all.find(
    (i: any) => i.type === "invoice" && !cancelledIds.has(i.id)
  );

  if (!invoice) {
    console.log("Keine gültige Rechnung gefunden.");
    return;
  }

  const data = invoice.snapshot?.data;
  const lines = data.shipping ? [...data.lines, data.shipping] : data.lines;

  console.log(`\nRechnung ${invoice.number} – Positionen:`);
  for (const line of lines) {
    console.log(
      `  ${line.position}. ${line.quantity} x ${line.title}   ` +
        `${Number(line.gross).toFixed(2)} ${data.currency_code}`
    );
  }

  const { creditNote } = await createCreditNote({
    container,
    invoiceId: invoice.id,
    items: [{ position: 1, quantity: 1 }],
  });

  console.log("\nGutschrift erstellt:");
  console.log(`  Nummer:       ${creditNote.number}`);
  console.log(`  Zu Rechnung:  ${invoice.number}`);
  console.log(
    `  Betrag:       ${Number(creditNote.total_gross).toFixed(2)} ${creditNote.currency_code}`
  );
  console.log(`  Datei:        ${creditNote.pdf_filename ?? "(keine)"}`);
}
