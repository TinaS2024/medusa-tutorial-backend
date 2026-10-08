import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { syncGiftCardCredits } from "../../../../../../lib/gift-card-credits";

/**
 * Rechnet die Gutschriften der Geschenkkarten neu aus.
 *
 *   POST /store/carts/:id/gift-cards/sync
 *
 * Der Shop ruft das auf, bevor der Kunde die Zahlungsart wählt – dann steht
 * der Endbetrag samt Versand fest.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const result = await syncGiftCardCredits(req.scope, req.params.id);
  res.json(result);
}
