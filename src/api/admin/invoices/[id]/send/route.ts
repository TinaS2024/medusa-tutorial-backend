import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { sendInvoiceMail } from "../../../../../lib/invoice/send-invoice-mail";

/**
 * Verschickt ein Dokument (erneut) an den Kunden.
 *
 * force: true – hier ist der Doppelversand ja ausdrücklich gewollt.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;

  const result = await sendInvoiceMail({
    container: req.scope,
    invoiceId: id,
    force: true,
  });

  if (!result.sent) {
    res.status(400).json({ message: result.reason ?? "Versand fehlgeschlagen" });
    return;
  }

  res.json({ sent: true });
}
