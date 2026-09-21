import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

import { INVOICE_MODULE } from "../../modules/invoice";
import { negateInvoiceData, type InvoiceData } from "./build-invoice-data";
import { renderInvoicePdf } from "./render-invoice-pdf";
import { saveInvoicePdf } from "./invoice-storage";
import { toFilename } from "./create-invoice";

/**
 * Storniert eine Rechnung vollständig.
 *
 * Die Originalrechnung bleibt unverändert bestehen – das ist der Kern:
 * Eine ausgestellte Rechnung wird nie geändert und nie gelöscht, sondern
 * durch ein zweites Dokument aufgehoben, das auf sie verweist.
 */
export async function createCancellation(args: {
  container: MedusaContainer;
  invoiceId: string;
}): Promise<{ cancellation: any; created: boolean }> {
  const { container, invoiceId } = args;

  const invoiceService: any = container.resolve(INVOICE_MODULE);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const [original] = await invoiceService.listInvoices({ id: invoiceId }, { take: 1 });

  if (!original) {
    throw new Error("Rechnung nicht gefunden.");
  }

  if (original.type !== "invoice") {
    throw new Error("Nur Rechnungen lassen sich stornieren, keine Korrekturen.");
  }

  // Schon storniert? Dann die vorhandene Stornorechnung liefern, keine zweite.
  const [existing] = await invoiceService.listInvoices(
    { corrects_invoice_id: original.id, type: "cancellation" },
    { take: 1 }
  );

  if (existing) {
    return { cancellation: existing, created: false };
  }

  // Storniert wird, was auf dem Papier stand – der eingefrorene snapshot.
  // NICHT neu aus der Bestellung rechnen: Die kann sich geändert haben,
  // und dann würde der Storno nicht zur Rechnung passen.
  const snapshot = (original.snapshot ?? {}) as { data?: InvoiceData };
  const originalData = snapshot.data;

  if (!originalData) {
    throw new Error(`Rechnung ${original.number} hat keine gespeicherten Daten.`);
  }

  const data = negateInvoiceData(originalData);
  const issuedAt = new Date();
  const correctsIssuedAt = new Date(original.issued_at);
  const serviceDate = original.service_date ? new Date(original.service_date) : null;

  const cancellation = await invoiceService.createInvoiceWithNumber("correction", {
    type: "cancellation",
    order_id: original.order_id,
    corrects_invoice_id: original.id,
    issued_at: issuedAt,
    service_date: serviceDate,
    currency_code: data.currency_code,
    total_net: data.total_net,
    total_tax: data.total_tax,
    total_gross: data.total_gross,
    locale: original.locale,
    buyer_vat_id: original.buyer_vat_id,
    tax_note: null,
    pdf_filename: null,
    mailed_at: null,
    snapshot: {
      data,
      issued_at: issuedAt,
      service_date: serviceDate,
      corrects: { number: original.number, issued_at: correctsIssuedAt },
    },
  });

  try {
    const buffer = await renderInvoicePdf({
      data,
      number: cancellation.number,
      issuedAt,
      serviceDate,
      documentType: "cancellation",
      corrects: { number: original.number, issuedAt: correctsIssuedAt },
    });

    const filename = toFilename(cancellation.number);
    await saveInvoicePdf(filename, buffer);
    await invoiceService.updateInvoices({ id: cancellation.id, pdf_filename: filename });
  } catch (e: any) {
    logger.error(
      `[invoice] PDF für ${cancellation.number} konnte nicht erzeugt werden: ${e?.message}`
    );
  }

  const [saved] = await invoiceService.listInvoices({ id: cancellation.id }, { take: 1 });

  return { cancellation: saved ?? cancellation, created: true };
}
