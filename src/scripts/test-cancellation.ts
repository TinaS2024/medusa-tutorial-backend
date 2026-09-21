import { ExecArgs } from "@medusajs/framework/types";
import { INVOICE_MODULE } from "../modules/invoice";
import { createCancellation } from "../lib/invoice/create-cancellation";

/**
 * Storniert die zuletzt erstellte Rechnung.
 * Aufruf:  npx medusa exec ./src/scripts/test-cancellation.ts
 */
export default async function ({ container }: ExecArgs) {
  const invoiceService: any = container.resolve(INVOICE_MODULE);

  const [latest] = await invoiceService.listInvoices(
    { type: "invoice" },
    { order: { created_at: "DESC" }, take: 1 }
  );

  if (!latest) {
    console.log("Keine Rechnung gefunden.");
    return;
  }

  const { cancellation, created } = await createCancellation({
    container,
    invoiceId: latest.id,
  });

  console.log("");
  console.log(created ? "Stornorechnung erstellt:" : "Storno gab es schon:");
  console.log(`  Nummer:      ${cancellation.number}`);
  console.log(`  Storniert:   ${latest.number}`);
  console.log(
    `  Betrag:      ${Number(cancellation.total_gross).toFixed(2)} ${cancellation.currency_code}`
  );
  console.log(`  Datei:       ${cancellation.pdf_filename ?? "(keine)"}`);
}
