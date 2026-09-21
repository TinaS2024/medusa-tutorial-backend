import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ExecArgs } from "@medusajs/framework/types";
import { createInvoice } from "../lib/invoice/create-invoice";
import { invoiceDir } from "../lib/invoice/invoice-storage";

/**
 * Erstellt eine ECHTE Rechnung zur neuesten Bestellung.
 * Aufruf:  npx medusa exec ./src/scripts/test-create-invoice.ts
 */
export default async function ({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id"],
    pagination: { order: { created_at: "DESC" }, take: 1 },
  });

  const order = orders?.[0];

  if (!order) {
    console.log("Keine Bestellung gefunden.");
    return;
  }

  const { invoice, created } = await createInvoice({
    container,
    orderId: order.id,
  });

  console.log("");
  console.log(created ? "Neue Rechnung erstellt:" : "Rechnung gab es schon:");
  console.log(`  Nummer:      ${invoice.number}`);
  console.log(`  Bestellung:  ${order.display_id}`);
  console.log(`  Betrag:      ${Number(invoice.total_gross).toFixed(2)} ${invoice.currency_code}`);
  console.log(`  Datei:       ${invoice.pdf_filename ?? "(keine)"}`);
  console.log(`  Ordner:      ${invoiceDir()}`);
}
