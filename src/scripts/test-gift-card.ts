import { ExecArgs } from "@medusajs/framework/types";
import { GIFT_CARD_MODULE } from "../modules/gift-card";
import type GiftCardModuleService from "../modules/gift-card/service";

/**
 * Legt eine Probe-Geschenkkarte über 25 € an und zeigt sie an.
 * Aufruf:  npx medusa exec ./src/scripts/test-gift-card.ts
 */
export default async function ({ container }: ExecArgs) {
  const giftCards: GiftCardModuleService = container.resolve(GIFT_CARD_MODULE);

  const card = await giftCards.issueGiftCard({
    amount_cents: 2500,
    currency_code: "eur",
    valid_years: 3,
  });

  console.log(`Code:       ${card.code}`);
  console.log(`Guthaben:   ${(card.balance_cents / 100).toFixed(2)} ${card.currency_code.toUpperCase()}`);
  // Das Ablaufdatum ist in Weltzeit (UTC) gespeichert – ohne timeZone
  // würde die Anzeige in deutsche Zeit umrechnen und den 1.1. zeigen.
  console.log(`Gültig bis: ${new Date(card.expires_at as any).toLocaleDateString("de-DE", { timeZone: "UTC" })}`);

}
