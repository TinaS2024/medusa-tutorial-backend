import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { GIFT_CARD_MODULE } from "../../../modules/gift-card";
import type GiftCardModuleService from "../../../modules/gift-card/service";
import { giftCardToDto, readGiftCardValidYears } from "../../../lib/gift-card";

const PAGE_SIZE = 50;

/**
 * Liste der Geschenkkarten.
 *
 *   GET /admin/gift-cards?q=7KQM&only_balance=true&offset=0
 *
 * q:            Teil des Codes (Groß-/Kleinschreibung egal)
 * only_balance: Vorgabe true – nur Karten mit Restguthaben
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const giftCards: GiftCardModuleService = req.scope.resolve(GIFT_CARD_MODULE);

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const onlyBalance = req.query.only_balance !== "false";
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const filters: Record<string, unknown> = {};
  if (q) filters.code = { $ilike: `%${q}%` };
  if (onlyBalance) filters.balance_cents = { $gt: 0 };

  const [cards, count] = await giftCards.listAndCountGiftCards(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: PAGE_SIZE,
  });

  res.json({ gift_cards: cards.map(giftCardToDto), count, offset, limit: PAGE_SIZE });
}

/**
 * Karte von Hand anlegen, z. B. aus Kulanz oder als Ersatz.
 *
 *   POST /admin/gift-cards
 *   Body: { amount: 25 }
 *
 * Nachträgliches Aufladen bestehender Karten gibt es bewusst nicht – eine
 * neue Karte ist sauberer nachvollziehbar.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const body = (req.body ?? {}) as Record<string, unknown>;
  const amount = Number(body.amount);
  const amountCents = Math.round(amount * 100);

  if (!Number.isFinite(amount) || amountCents < 100 || amountCents > 100000) 
  {
    res.status(400).json({ message: "Der Betrag muss zwischen 1 und 1000 € liegen." });
    return;
  }

  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  const giftCards: GiftCardModuleService = req.scope.resolve(GIFT_CARD_MODULE);
  const card = await giftCards.issueGiftCard({
    amount_cents: amountCents,
    currency_code: "eur",
    order_id: null,
    valid_years: readGiftCardValidYears(store?.metadata),
  });

  res.json({ gift_card: giftCardToDto(card) });
}
