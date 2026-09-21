import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { ExecArgs } from "@medusajs/framework/types";
import { buildInvoiceData } from "../lib/invoice/build-invoice-data";

/**
 * Zeigt die Rechnungsdaten der neuesten Bestellung als Text an.
 * Aufruf:  npx medusa exec ./src/scripts/test-invoice-data.ts
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
    console.log("Keine Bestellung gefunden. Bitte im Shop eine Testbestellung aufgeben.");
    return;
  }

  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const data = buildInvoiceData({ order, storeMetadata: store?.metadata as any });

  const money = (n: number) => n.toFixed(2).replace(".", ",");

  console.log("");
  console.log(`Bestellung ${data.order_reference}   Sprache: ${data.locale}   Währung: ${data.currency_code}`);
  console.log(`Verkäufer:  ${data.seller.company ?? "(nicht hinterlegt)"}  Sitzland: ${data.seller.country.toUpperCase()}`);
  console.log(`Käufer:     ${data.buyer.name || "(kein Name)"}  ${data.buyer.address_lines.join(", ")}`);
  console.log("");

  console.log("POSITIONEN");
  for (const line of data.lines) {
    console.log(
      `  ${line.position}. ${line.quantity} x ${line.title}` +
        `   netto ${money(line.net)}   ${line.tax_rate}%   Steuer ${money(line.tax)}   brutto ${money(line.gross)}`
    );
  }

  if (data.shipping) {
    console.log(
      `  ${data.shipping.position}. ${data.shipping.title}` +
        `   netto ${money(data.shipping.net)}   ${data.shipping.tax_rate}%   Steuer ${money(data.shipping.tax)}   brutto ${money(data.shipping.gross)}`
    );
  } else {
    console.log("  (keine Versandkosten)");
  }

  console.log("");
  console.log("STEUER JE SATZ");
  for (const g of data.tax_groups) {
    console.log(`  ${g.rate}%   Entgelt ${money(g.net)}   Steuer ${money(g.tax)}`);
  }

  console.log("");
  console.log(`  Summe netto   ${money(data.total_net)}`);
  console.log(`  Umsatzsteuer  ${money(data.total_tax)}`);
  console.log(`  Gesamtbetrag  ${money(data.total_gross)}`);

  // Die Probe: Stimmt unsere Rechnung mit dem überein, was der Kunde
  // tatsächlich bezahlt hat?
  const paid = Number(order.total ?? 0);
  const diff = Math.round((data.total_gross - paid) * 100) / 100;

  console.log("");
  console.log(`  Bestellung sagt: ${money(paid)}`);
  console.log(
    diff === 0
      ? "  OK – Rechnungsbetrag und Bestellbetrag stimmen überein."
      : `  ACHTUNG – Abweichung von ${money(diff)}`
  );
}
