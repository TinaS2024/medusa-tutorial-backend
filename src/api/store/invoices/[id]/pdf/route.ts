import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INVOICE_MODULE } from "../../../../../modules/invoice";
import { readInvoicePdf } from "../../../../../lib/invoice/invoice-storage";
import { customerOwnsOrder } from "../../../../../lib/invoice/customer-access";

/**
 * Liefert das gespeicherte PDF an den Kunden aus, dem es gehört.
 *
 * Der Weg ist umgekehrt wie im Admin: Erst wird die Rechnung gesucht,
 * dann geprüft, wem die zugehörige Bestellung gehört.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const invoiceService: any = req.scope.resolve(INVOICE_MODULE);

  const [invoice] = await invoiceService.listInvoices({ id }, { take: 1 });

  if (!invoice || !(await customerOwnsOrder(req, invoice.order_id))) {
    res.status(404).json({ message: "Nicht gefunden" });
    return;
  }

  if (!invoice.pdf_filename) {
    res.status(404).json({ message: "Nicht gefunden" });
    return;
  }

  try {
    const buffer = await readInvoicePdf(invoice.pdf_filename);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.pdf_filename}"`);
    res.send(buffer);
  } catch {
    res.status(404).json({ message: "Nicht gefunden" });
  }
}
