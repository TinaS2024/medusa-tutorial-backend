import { ExecArgs } from "@medusajs/framework/types";
import { GIFT_CARD_MODULE } from "../modules/gift-card";
import type GiftCardModuleService from "../modules/gift-card/service";

/**
 * Zeigt die zehn neuesten Geschenkkarten.
 * Aufruf:  npx medusa exec ./src/scripts/list-gift-cards.ts
 */
export default async function ({ container }: ExecArgs) {
  const giftCards: GiftCardModuleService = container.resolve(GIFT_CARD_MODULE);

  const cards = await giftCards.listGiftCards({}, { order: { created_at: "DESC" }, take: 10 });

  for (const card of cards) 
  {
    const balance = (card.balance_cents / 100).toFixed(2);
    // Ablaufdatum in Weltzeit anzeigen, sonst erscheint der 1.1. (siehe G2).
    const validUntil = card.expires_at
      ? new Date(card.expires_at as any).toLocaleDateString("de-DE", { timeZone: "UTC" })
      : "unbegrenzt";
    console.log(
      `${card.code}  ${balance} ${card.currency_code.toUpperCase()}  ` +
        `Bestellung: ${card.order_id ?? "—"}  gültig bis ${validUntil}`
    );
  }
}
