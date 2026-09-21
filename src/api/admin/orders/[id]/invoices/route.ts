import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { INVOICE_MODULE } from "../../../../../modules/invoice";
import { createInvoice } from "../../../../../lib/invoice/create-invoice";
import { sendInvoiceMail } from "../../../../../lib/invoice/send-invoice-mail";

/** Alle Rechnungen zu einer Bestellung, neueste zuerst. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const invoiceService: any = req.scope.resolve(INVOICE_MODULE);

  const invoices = await invoiceService.listInvoices(
    { order_id: id },
    { order: { created_at: "DESC" } }
  );

  res.json({ invoices });
}

/** Rechnung von Hand erstellen – der Knopf im Admin. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;

  try {
      const { invoice, created } = await createInvoice({
      container: req.scope,
      orderId: id,
    });

    // Nur bei einer frisch erstellten Rechnung verschicken. Die Sperre
    // über mailed_at sorgt dafür, dass die Statusmeldung sie später nicht
    // noch einmal anhängt.
    const mail = created
      ? await sendInvoiceMail({ container: req.scope, invoiceId: invoice.id })
      : { sent: false, reason: "Rechnung gab es schon" };

    console.log(
      `[Invoice] Rechnung ${invoice.number}: ` +
        (mail.sent ? "Mail verschickt" : `keine Mail – ${mail.reason}`)
    );

    res.json({ invoice, created, mail });

  } catch (e: any) {
    res.status(400).json({
      message: e?.message ?? "Rechnung konnte nicht erstellt werden",
    });
  }
}
