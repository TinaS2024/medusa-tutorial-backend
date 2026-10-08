import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GIFT_CARD_MODULE } from "../../../../modules/gift-card";
import type GiftCardModuleService from "../../../../modules/gift-card/service";
import { giftCardToDto } from "../../../../lib/gift-card";

/**
 * Karte sperren oder entsperren.
 *
 *   POST /admin/gift-cards/:id
 *   Body: { is_disabled: true }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.is_disabled !== "boolean") 
  {
    res.status(400).json({ message: "is_disabled fehlt." });
    return;
  }

  const giftCards: GiftCardModuleService = req.scope.resolve(GIFT_CARD_MODULE);
  const [card] = await giftCards.listGiftCards({ id: req.params.id }, { take: 1 });
  if (!card) 
  {
    res.status(404).json({ message: "Geschenkkarte nicht gefunden." });
    return;
  }

  const updated = await giftCards.updateGiftCards({ id: card.id, is_disabled: body.is_disabled });
  res.json({ gift_card: giftCardToDto(updated) });
}
