import { ExecArgs } from "@medusajs/framework/types";
import { INVOICE_MODULE } from "../modules/invoice";

/**
 * Zeigt alle Rechnungen mit ihrem Dateinamen.
 * Aufruf:  npx medusa exec ./src/scripts/list-invoices.ts
 */
export default async function ({ container }: ExecArgs) {
  const invoiceService: any = container.resolve(INVOICE_MODULE);

  const invoices = await invoiceService.listInvoices(
    {},
    { order: { created_at: "ASC" } }
  );

  console.log("");
  for (const invoice of invoices) {
    console.log(
      `${invoice.number}   Typ: ${invoice.type}   Datei: ${
        invoice.pdf_filename ?? "(NICHT GESETZT)"
      }`
    );
  }
  console.log(`\n${invoices.length} Rechnung(en).`);
}
