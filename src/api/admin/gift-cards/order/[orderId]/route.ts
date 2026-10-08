import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GIFT_CARD_MODULE } from "../../../../../modules/gift-card";
import type GiftCardModuleService from "../../../../../modules/gift-card/service";

/**
 * Geschenkkarten einer Bestellung – für das Widget auf der Bestellseite.
 *
 *   GET /admin/gift-cards/order/:orderId
 *
 * purchased: mit dieser Bestellung GEKAUFTE Karten, mit vollem Code –
 *            den braucht die Produktion für den Druck.
 * redeemed:  bei dieser Bestellung EINGELÖSTE Karten, mit Betrag.
 *
 * Nur für angemeldete Admin-Benutzer – Medusa schützt alles unter /admin.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const giftCards: GiftCardModuleService = req.scope.resolve(GIFT_CARD_MODULE);
  const orderId = req.params.orderId;

  const purchased = await giftCards.listGiftCards(
    { order_id: orderId },
    { order: { created_at: "ASC" } }
  );

  const redemptions = await giftCards.listGiftCardRedemptions({ order_id: orderId });
  const cardIds = [...new Set(redemptions.map((r: any) => r.gift_card_id))] as string[];
  const redeemedCards = cardIds.length > 0 ? await giftCards.listGiftCards({ id: cardIds }) : [];
  const codeById = new Map(redeemedCards.map((card: any) => [card.id, card.code]));

  res.json({
    purchased: purchased.map((card: any) => ({
      id: card.id,
      code: card.code,
      initial_amount: card.initial_amount_cents / 100,
      balance: card.balance_cents / 100,
      currency_code: card.currency_code,
      expires_at: card.expires_at,
      is_disabled: card.is_disabled,
    })),
    redeemed: redemptions.map((r: any) => ({
      id: r.id,
      gift_card_id: r.gift_card_id,
      code: codeById.get(r.gift_card_id) ?? null,
      amount: r.amount_cents / 100,
    })),
  });
}
