import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { GIFT_CARD_MODULE } from "../modules/gift-card";
import type GiftCardModuleService from "../modules/gift-card/service";

type OrderCanceledEvent = { id: string }

/**
 * Storno einer Bestellung:
 *
 * 1. Eingelöste Geschenkkarten bekommen ihr Guthaben zurück. Medusa erstattet
 *    beim Storno nur Karte/PayPal – den Geschenkkarten-Anteil kennt es nicht.
 *
 * 2. Mit dieser Bestellung GEKAUFTE Karten werden gesperrt – das Geld bekommt
 *    der Käufer über die Erstattung zurück. War so eine Karte schon (teilweise)
 *    eingelöst, muss ein Mensch das klären – dafür die Warnung im Protokoll.
 */
export default async function orderCanceledGiftCardSubscriber({
  event: { data },
  container,
}: SubscriberArgs<OrderCanceledEvent>) 
{
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const giftCards: GiftCardModuleService = container.resolve(GIFT_CARD_MODULE);

  const refundedCents = await giftCards.refundOrderRedemptions(data.id);
  if (refundedCents > 0) 
  {
    logger.info(
      `[Geschenkkarte] Storno ${data.id}: ${(refundedCents / 100).toFixed(2)} ` +
        `zurück auf die Geschenkkarte(n) gebucht.`
    );
  }

  const purchased = await giftCards.listGiftCards({ order_id: data.id, is_disabled: false });
  if (purchased.length === 0) return;

  await giftCards.updateGiftCards(
    purchased.map((card: any) => ({ id: card.id, is_disabled: true }))
  );
  logger.info(`[Geschenkkarte] Storno ${data.id}: ${purchased.length} gekaufte Karte(n) gesperrt.`);

  const alreadyUsed = purchased.filter((card: any) => card.balance_cents < card.initial_amount_cents);
  if (alreadyUsed.length > 0) 
  {
    logger.warn(
      `[Geschenkkarte] Storno ${data.id}: ${alreadyUsed.length} der gesperrten Karte(n) ` +
        `waren schon (teilweise) eingelöst – bitte prüfen (Admin → Bestellung → Geschenkkarten).`
    );
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
