import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createCreditNote, type CreditItem} from "../../../../../lib/invoice/create-credit-note";
import { sendInvoiceMail } from "../../../../../lib/invoice/send-invoice-mail";

/** Erstellt eine Rechnungskorrektur für ausgewählte Positionen. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const body = (req.body ?? {}) as { items?: CreditItem[] };

  // Leere und ungültige Zeilen aussortieren – das Formular schickt für
  // jede Position etwas mit, auch wenn nichts eingetragen wurde.
  const items = (body.items ?? [])
    .map((i) => ({ position: Number(i.position), quantity: Number(i.quantity) }))
    .filter((i) => Number.isFinite(i.position) && i.quantity > 0);

  if (!items.length) {
    res.status(400).json({ message: "Keine Position ausgewählt." });
    return;
  }

  try {
      const { creditNote } = await createCreditNote({
      container: req.scope,
      invoiceId: id,
      items,
    });

    const mail = await sendInvoiceMail({
      container: req.scope,
      invoiceId: creditNote.id,
    });

    console.log(`[Invoice] Korrektur ${creditNote.number}: ` +(mail.sent ? "Mail verschickt" : `keine Mail – ${mail.reason}`));

    res.json({ creditNote, mail });

  } catch (e: any) {
    res.status(400).json({ message: e?.message ?? "Korrektur fehlgeschlagen" });
  }
}
