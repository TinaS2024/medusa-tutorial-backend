import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INVOICE_MODULE } from "../../../../../modules/invoice";
import { readInvoicePdf } from "../../../../../lib/invoice/invoice-storage";

/**
 * Liefert das gespeicherte PDF aus.
 *
 * Es wird NICHT neu gerendert: Ausgeliefert wird genau die Datei, die bei
 * der Erstellung entstanden ist. Eine Rechnung darf sich nicht ändern,
 * nur weil sich inzwischen ein Preis oder eine Anschrift geändert hat.
 *
 * Die Datei liegt außerhalb des öffentlichen Ordners – nur über diese
 * Route, und damit nur angemeldet, kommt jemand an sie heran.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const invoiceService: any = req.scope.resolve(INVOICE_MODULE);

  const [invoice] = await invoiceService.listInvoices({ id }, { take: 1 });

  if (!invoice) {
    res.status(404).json({ message: "Rechnung nicht gefunden" });
    return;
  }

  if (!invoice.pdf_filename) {
    res.status(404).json({ message: "Zu dieser Rechnung gibt es keine Datei." });
    return;
  }

  try {
    const buffer = await readInvoicePdf(invoice.pdf_filename);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.pdf_filename}"`);
    res.send(buffer);
  } catch {
    res.status(404).json({ message: "Datei nicht gefunden" });
  }
}
