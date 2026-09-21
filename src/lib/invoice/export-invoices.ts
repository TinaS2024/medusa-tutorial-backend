import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

import { INVOICE_MODULE } from "../../modules/invoice";
import { readInvoicePdf } from "./invoice-storage";

/** Nur die zwei Methoden von adm-zip, die wir benutzen. */
type Zip = {
  addFile(entryName: string, content: Buffer): void;
  toBuffer(): Buffer;
};

const AdmZip = require("adm-zip") as new () => Zip;

/**
 * Spaltenüberschriften der CSV-Liste. Wenn eure Buchhaltung andere
 * Bezeichnungen oder eine andere Reihenfolge braucht, ist das die einzige
 * Stelle, die zusammen mit `toRow` angepasst werden muss.
 */
const CSV_HEADER = [
  "Nummer",
  "Typ",
  "Belegdatum",
  "Leistungsdatum",
  "Bestellung",
  "Kunde",
  "Land",
  "Netto",
  "Steuer",
  "Brutto",
  "Waehrung",
  "Korrigiert",
  "Datei",
];

const TYPE_LABELS: Record<string, string> = {
  invoice: "Rechnung",
  cancellation: "Stornorechnung",
  credit_note: "Rechnungskorrektur",
};

/**
 * Ein CSV-Feld. Immer in Anführungszeichen, innere Anführungszeichen
 * verdoppelt – sonst zerlegt ein Semikolon in einem Kundennamen die
 * ganze Zeile.
 */
const csvValue = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

/** Betrag mit Komma – so erwartet es ein deutsches Tabellenprogramm. */
const money = (value: unknown) => Number(value ?? 0).toFixed(2).replace(".", ",");

/** Datum als 2026-09-21 – eindeutig, egal in welchem Land gelesen. */
const day = (value: unknown) => (value ? new Date(value as string).toISOString().slice(0, 10) : "");

/**
 * Packt alle Dokumente eines Zeitraums in ein ZIP.
 *
 * Alles wird im Arbeitsspeicher aufgebaut. Bei den üblichen Größen (ein
 * Rechnungs-PDF ist etwa 3 KB) ist das unkritisch, deshalb die Obergrenze
 * weiter unten statt einer aufwendigen Stream-Lösung.
 */
export async function exportInvoices(args: {
  container: MedusaContainer;
  from: Date;
  to: Date;
}): Promise<{ zip: Buffer; count: number; filename: string }> {
  const { container, from, to } = args;

  const invoiceService: any = container.resolve(INVOICE_MODULE);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const invoices = await invoiceService.listInvoices(
    { issued_at: { $gte: from, $lte: to } },
    { order: { issued_at: "ASC" } }
  );

  if (!invoices.length) {
    throw new Error("Im gewählten Zeitraum gibt es keine Dokumente.");
  }

  if (invoices.length > 5000) {
    throw new Error(
      `${invoices.length} Dokumente sind zu viele für einen Durchgang. ` +
        "Bitte einen kürzeren Zeitraum wählen, zum Beispiel einen Monat."
    );
  }

  const zip = new AdmZip();
  const rows: string[] = [CSV_HEADER.map(csvValue).join(";")];

  for (const invoice of invoices) {
    const data = invoice.snapshot?.data ?? {};
    const buyer = data.buyer ?? {};

    // Die zugehörige Rechnung, falls es eine Korrektur ist.
    let corrects = "";
    if (invoice.corrects_invoice_id) {
      const [original] = await invoiceService.listInvoices(
        { id: invoice.corrects_invoice_id },
        { take: 1 }
      );
      corrects = original?.number ?? "";
    }

    rows.push(
      [
        invoice.number,
        TYPE_LABELS[invoice.type] ?? invoice.type,
        day(invoice.issued_at),
        day(invoice.service_date),
        data.order_reference ?? "",
        [buyer.company, buyer.name].filter(Boolean).join(" / "),
        (buyer.address_lines ?? []).slice(-1)[0] ?? "",
        money(invoice.total_net),
        money(invoice.total_tax),
        money(invoice.total_gross),
        invoice.currency_code,
        corrects,
        invoice.pdf_filename ?? "",
      ]
        .map(csvValue)
        .join(";")
    );

    // Fehlt eine Datei, soll der ganze Export trotzdem zustande kommen –
    // in der Liste steht die Zeile ja, nur der Beleg fehlt.
    if (invoice.pdf_filename) {
      try {
        const content = await readInvoicePdf(invoice.pdf_filename);
        zip.addFile(`pdf/${invoice.pdf_filename}`, content);
      } catch (e: any) {
        logger.warn(
          `[invoice] Export: Datei ${invoice.pdf_filename} nicht lesbar (${e?.message})`
        );
      }
    }
  }

  // Das BOM am Anfang sorgt dafür, dass Excel die Umlaute richtig liest.
  const csv = "\ufeff" + rows.join("\r\n") + "\r\n";
  zip.addFile("rechnungen.csv", Buffer.from(csv, "utf8"));

  const filename = `rechnungen_${day(from)}_bis_${day(to)}.zip`;

  return { zip: zip.toBuffer(), count: invoices.length, filename };
}
