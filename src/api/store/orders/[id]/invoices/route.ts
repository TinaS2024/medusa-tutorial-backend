import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INVOICE_MODULE } from "../../../../../modules/invoice";
import { customerOwnsOrder } from "../../../../../lib/invoice/customer-access";

/** Die Rechnungen des angemeldeten Kunden zu einer seiner Bestellungen. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params;

  if (!(await customerOwnsOrder(req, id))) {
    res.status(404).json({ message: "Nicht gefunden" });
    return;
  }

  const invoiceService: any = req.scope.resolve(INVOICE_MODULE);

  const invoices = await invoiceService.listInvoices(
    { order_id: id },
    { order: { created_at: "DESC" } }
  );

  // Bewusst nur diese Felder. Die Zeile enthält auch den snapshot mit
  // allen internen Daten – der bleibt im Backend.
  res.json({
    invoices: invoices.map((invoice: any) => ({
      id: invoice.id,
      number: invoice.number,
      type: invoice.type,
      issued_at: invoice.issued_at,
      total_gross: invoice.total_gross,
      currency_code: invoice.currency_code,
      has_pdf: Boolean(invoice.pdf_filename),
    })),
  });
}
