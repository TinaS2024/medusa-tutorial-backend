import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { ExecArgs } from "@medusajs/framework/types";
import { buildInvoiceData } from "../lib/invoice/build-invoice-data";
import { renderInvoicePdf } from "../lib/invoice/render-invoice-pdf";
import { saveInvoicePdf } from "../lib/invoice/invoice-storage";

/**
 * Erzeugt aus der neuesten Bestellung ein Probe-PDF.
 * Aufruf:  npx medusa exec ./src/scripts/test-invoice-pdf.ts
 */
export default async function ({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const storeModuleService = container.resolve(Modules.STORE);

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id", "display_id", "email", "currency_code", "locale", "created_at",
      "total", "subtotal", "tax_total", "discount_total",
      "shipping_subtotal", "shipping_tax_total", "shipping_discount_total",
      "billing_address.*",
      "shipping_address.*",
      "items.*",
      "items.tax_lines.*",
      "shipping_methods.*",
      "shipping_methods.tax_lines.*",
    ],
    pagination: { order: { created_at: "DESC" }, take: 1 },
  });

  const order = orders?.[0];

  if (!order) {
    console.log("Keine Bestellung gefunden.");
    return;
  }

  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const data = buildInvoiceData({ order, storeMetadata: store?.metadata as any });

  // Absichtlich KEINE echte Nummer ziehen. Ein Probe-PDF darf keine
  // Rechnungsnummer verbrauchen – die wären sonst nicht mehr lückenlos.
  const buffer = await renderInvoicePdf({
    data,
    number: "PROBE-0001",
    issuedAt: new Date(),
    serviceDate: new Date(),
  });

  const target = await saveInvoicePdf("PROBE-0001.pdf", buffer);

  console.log(`PDF erzeugt: ${target}`);
  console.log(`Bestellung ${data.order_reference}, ${data.total_gross.toFixed(2)} ${data.currency_code}`);
}
