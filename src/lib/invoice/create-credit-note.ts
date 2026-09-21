import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

import { INVOICE_MODULE } from "../../modules/invoice";
import type { InvoiceData, InvoiceLine } from "./build-invoice-data";
import { negateInvoiceData, round2 } from "./build-invoice-data";
import { renderInvoicePdf } from "./render-invoice-pdf";
import { saveInvoicePdf } from "./invoice-storage";
import { toFilename } from "./create-invoice";

/** Was gutgeschrieben werden soll: Positionsnummer der Rechnung und Menge. */
export type CreditItem = {
  position: number;
  quantity: number;
};

/**
 * Schreibt einzelne Positionen einer Rechnung gut.
 *
 * Anders als beim Storno darf es mehrere Gutschriften zu einer Rechnung
 * geben – zwei Artikel können ja nacheinander zurückkommen. Deshalb wird
 * mitgezählt, was schon gutgeschrieben wurde: Insgesamt darf nie mehr
 * zurückgegeben werden, als auf der Rechnung stand.
 */
export async function createCreditNote(args: {
  container: MedusaContainer;
  invoiceId: string;
  items: CreditItem[];
}): Promise<{ creditNote: any }> {
  const { container, invoiceId, items } = args;

  const invoiceService: any = container.resolve(INVOICE_MODULE);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const [original] = await invoiceService.listInvoices({ id: invoiceId }, { take: 1 });

  if (!original) {
    throw new Error("Rechnung nicht gefunden.");
  }

  if (original.type !== "invoice") {
    throw new Error("Gutschriften beziehen sich auf Rechnungen, nicht auf Korrekturen.");
  }

  const snapshot = (original.snapshot ?? {}) as { data?: InvoiceData };
  const originalData = snapshot.data;

  if (!originalData) {
    throw new Error(`Rechnung ${original.number} hat keine gespeicherten Daten.`);
  }

  // Alle Positionen der Originalrechnung – Versand zählt als eine davon.
  const allLines: InvoiceLine[] = originalData.shipping
    ? [...originalData.lines, originalData.shipping]
    : originalData.lines;

  // Was wurde zu dieser Rechnung schon gutgeschrieben?
  const previous = await invoiceService.listInvoices(
    { corrects_invoice_id: original.id, type: "credit_note" },
    {}
  );

  const already = new Map<number, number>();

  for (const note of previous) {
    const credited = (note.snapshot?.credited ?? []) as CreditItem[];
    for (const entry of credited) {
      already.set(entry.position, (already.get(entry.position) ?? 0) + entry.quantity);
    }
  }

  const creditedLines: InvoiceLine[] = [];
  const credited: CreditItem[] = [];

  for (const item of items) {
    const line = allLines.find((l) => l.position === item.position);

    if (!line) {
      throw new Error(`Position ${item.position} gibt es auf ${original.number} nicht.`);
    }

    if (!(item.quantity > 0)) {
      throw new Error(`Position ${item.position}: Menge muss größer als 0 sein.`);
    }

    const open = line.quantity - (already.get(item.position) ?? 0);

    if (item.quantity > open) {
      throw new Error(
        `Position ${item.position}: nur noch ${open} von ${line.quantity} gutschreibbar.`
      );
    }

    // Anteilig rechnen: die halbe Menge ergibt den halben Betrag. Die
    // Steuer wird NICHT neu berechnet, sondern anteilig übernommen –
    // damit bleibt der Satz derselbe wie auf der Rechnung.
    const factor = item.quantity / line.quantity;
    const net = round2(line.net * factor);
    const tax = round2(line.tax * factor);

    creditedLines.push({
      ...line,
      position: creditedLines.length + 1,
      quantity: item.quantity,
      net,
      tax,
      gross: round2(net + tax),
    });

    credited.push({ position: item.position, quantity: item.quantity });
  }

  if (!creditedLines.length) {
    throw new Error("Es wurde keine Position ausgewählt.");
  }

  // Steuer je Satz, genau wie bei der Rechnung: Zeilenbeträge summieren.
  const groups = new Map<number, { rate: number; net: number; tax: number }>();

  for (const line of creditedLines) {
    const group = groups.get(line.tax_rate) ?? { rate: line.tax_rate, net: 0, tax: 0 };
    group.net = round2(group.net + line.net);
    group.tax = round2(group.tax + line.tax);
    groups.set(line.tax_rate, group);
  }

  const totalNet = round2(creditedLines.reduce((s, l) => s + l.net, 0));
  const totalTax = round2(creditedLines.reduce((s, l) => s + l.tax, 0));

  const positive: InvoiceData = {
    ...originalData,
    lines: creditedLines,
    shipping: null,
    tax_groups: [...groups.values()].sort((a, b) => a.rate - b.rate),
    total_net: totalNet,
    total_tax: totalTax,
    total_gross: round2(totalNet + totalTax),
  };

  const data = negateInvoiceData(positive);

  const issuedAt = new Date();
  const correctsIssuedAt = new Date(original.issued_at);
  const serviceDate = original.service_date ? new Date(original.service_date) : null;

  const creditNote = await invoiceService.createInvoiceWithNumber("correction", {
    type: "credit_note",
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
      // Mit den ORIGINAL-Positionsnummern, damit die nächste Gutschrift
      // weiß, was schon zurückgegeben wurde.
      credited,
    },
  });

  try {
    const buffer = await renderInvoicePdf({
      data,
      number: creditNote.number,
      issuedAt,
      serviceDate,
      documentType: "credit_note",
      corrects: { number: original.number, issuedAt: correctsIssuedAt },
    });

    const filename = toFilename(creditNote.number);
    await saveInvoicePdf(filename, buffer);
    await invoiceService.updateInvoices({ id: creditNote.id, pdf_filename: filename });
  } catch (e: any) {
    logger.error(
      `[invoice] PDF für ${creditNote.number} konnte nicht erzeugt werden: ${e?.message}`
    );
  }

  const [saved] = await invoiceService.listInvoices({ id: creditNote.id }, { take: 1 });

  return { creditNote: saved ?? creditNote };
}
