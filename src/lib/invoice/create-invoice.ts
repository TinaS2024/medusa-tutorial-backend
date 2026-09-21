import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

import { INVOICE_MODULE } from "../../modules/invoice";
import { buildInvoiceData } from "./build-invoice-data";
import { renderInvoicePdf } from "./render-invoice-pdf";
import { saveInvoicePdf } from "./invoice-storage";

/**
 * Die Felder, die eine Rechnung von der Bestellung braucht.
 *
 * Steht hier an einer Stelle, damit die Testskripte und der spätere
 * Auslöser nicht jeweils eine eigene, leicht abweichende Liste pflegen.
 */
export const INVOICE_ORDER_FIELDS = [
  "id", "display_id", "email", "currency_code", "locale", "created_at",
  "total", "subtotal", "tax_total", "discount_total",
  "shipping_subtotal", "shipping_tax_total", "shipping_discount_total",
  "billing_address.*",
  "shipping_address.*",
  "items.*",
  "items.tax_lines.*",
  "shipping_methods.*",
  "shipping_methods.tax_lines.*",
];

/**
 * Aus der Rechnungsnummer einen sicheren Dateinamen machen.
 *
 * Das Präfix ist im Admin frei eintragbar. Schreibt jemand "RE/2026-",
 * stünde ein Schrägstrich im Dateinamen und die Datei landete in einem
 * Unterordner oder überschriebe eine andere.
 */
export const toFilename = (number: string) =>
  `${number.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;

/**
 * Erstellt die Rechnung zu einer Bestellung.
 *
 * Gibt es schon eine, wird diese zurückgegeben – eine zweite Rechnung zur
 * selben Bestellung darf es nicht geben.
 */
export async function createInvoice(args: {
  container: MedusaContainer;
  orderId: string;
  serviceDate?: Date | null;
}): Promise<{ invoice: any; created: boolean }> {
  const { container, orderId } = args;

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const storeModuleService = container.resolve(Modules.STORE);
  const invoiceService: any = container.resolve(INVOICE_MODULE);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  // 1. Gibt es schon eine GÜLTIGE Rechnung zu dieser Bestellung?
  //
  //    Eine stornierte Rechnung zählt nicht mehr – sonst wäre ein Storno
  //    eine Sackgasse: Man könnte danach nie eine korrigierte Rechnung
  //    ausstellen.
  const all = await invoiceService.listInvoices({ order_id: orderId }, {});

  const cancelledIds = new Set(
    all
      .filter((i: any) => i.type === "cancellation")
      .map((i: any) => i.corrects_invoice_id)
  );

  const openInvoice = all.find(
    (i: any) => i.type === "invoice" && !cancelledIds.has(i.id)
  );

  if (openInvoice) {
    return { invoice: openInvoice, created: false };
  }


  // 2. Daten holen und aufbereiten – bis hierhin wird nichts verändert.
  const { data: orders } = await query.graph({
    entity: "order",
    fields: INVOICE_ORDER_FIELDS,
    filters: { id: orderId },
  });

  const order = orders?.[0];

  if (!order) {
    throw new Error(`Bestellung ${orderId} nicht gefunden.`);
  }

  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const data = buildInvoiceData({ order, storeMetadata: store?.metadata as any });

  const issuedAt = new Date();
  const serviceDate = args.serviceDate ?? issuedAt;

  // 3. Nummer ziehen und Zeile schreiben – gemeinsam oder gar nicht.
  //    Der snapshot ist die unveränderliche Kopie: Aus ihm lässt sich das
  //    PDF jederzeit neu erzeugen, auch wenn sich Produkte oder Preise
  //    längst geändert haben.
  const invoice = await invoiceService.createInvoiceWithNumber("invoice", {
    type: "invoice",
    order_id: orderId,
    issued_at: issuedAt,
    service_date: serviceDate,
    currency_code: data.currency_code,
    total_net: data.total_net,
    total_tax: data.total_tax,
    total_gross: data.total_gross,
    locale: data.language,
    buyer_vat_id: data.buyer.vat_id,
    tax_note: null,
    pdf_filename: null,
    snapshot: { data, issued_at: issuedAt, service_date: serviceDate },
  });

  // 4. PDF erzeugen und ablegen. Schlägt das fehl, bleibt die Rechnung
  //    gültig – nur die Datei fehlt und kann nachgebaut werden.
    try {
    const buffer = await renderInvoicePdf({
      data,
      number: invoice.number,
      issuedAt,
      serviceDate,
    });

    const filename = toFilename(invoice.number);
    await saveInvoicePdf(filename, buffer);

    await invoiceService.updateInvoices({ id: invoice.id, pdf_filename: filename });
  } catch (e: any) {
    logger.error(
      `[invoice] PDF für ${invoice.number} konnte nicht erzeugt werden: ${e?.message}`
    );
  }

  // Die Zeile frisch aus der Datenbank lesen, statt das zurückgegebene
  // Objekt nachträglich zu verändern. Das Objekt aus dem Anlegen kennt den
  // Dateinamen noch nicht, und ob man es überhaupt verändern darf, hängt
  // vom Datenbank-Werkzeug ab – das Nachlesen stimmt immer.
  const [saved] = await invoiceService.listInvoices({ id: invoice.id }, { take: 1 });

  return { invoice: saved ?? invoice, created: true };
}

