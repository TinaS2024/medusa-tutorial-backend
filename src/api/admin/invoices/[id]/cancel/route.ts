import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createCancellation } from "../../../../../lib/invoice/create-cancellation";
import { sendInvoiceMail } from "../../../../../lib/invoice/send-invoice-mail";

/** Storniert eine Rechnung. Der Knopf im Bestell-Widget ruft das auf. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;

  try {
      const { cancellation, created } = await createCancellation({
      container: req.scope,
      invoiceId: id,
    });

    // Nur bei einem frisch erstellten Storno verschicken. Gab es ihn
    // schon, hat der Kunde ihn bereits bekommen.
    const mail = created ? await sendInvoiceMail({ container: req.scope, invoiceId: cancellation.id })
      : { sent: false, reason: "Storno gab es schon" };

     console.log( `[Invoice] Storno ${cancellation.number}: ` + (mail.sent ? "Mail verschickt" : `keine Mail – ${mail.reason}`));


    res.json({ cancellation, created, mail });
  } catch (e: any) {
    res.status(400).json({ message: e?.message ?? "Storno fehlgeschlagen" });
  }
}
