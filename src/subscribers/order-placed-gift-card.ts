import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { GIFT_CARD_MODULE } from "../modules/gift-card";
import type GiftCardModuleService from "../modules/gift-card/service";
import { isGiftCardProduct, readGiftCardValidYears } from "../lib/gift-card";

type OrderPlacedEvent = { id: string }

/**
 * Nach jeder Bestellung: Für jede gekaufte Geschenkkarte eine Karte mit
 * eigenem Code anlegen. Bei Menge 2 entstehen zwei Karten.
 *
 * Der Wert ist der Preis der Position (Geschenkkarten haben 0 % Steuer,
 * Netto = Brutto). Die Codes stehen bei der Bestellung in der Datenbank;
 * sie werden bewusst NICHT ins Protokoll geschrieben – sie sind Geld wert.
 */
export default async function orderPlacedGiftCardSubscriber({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) 
{
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const giftCards: GiftCardModuleService = container.resolve(GIFT_CARD_MODULE);

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "currency_code",
      // items.* statt einzelner Felder: Menge und Preis setzt Medusa bei
      // Bestellungen erst zusammen, wenn die ganze Position geladen wird.
      "items.*",
      "items.variant.product.metadata",
    ],
    filters: { id: data.id },
  });

  if (!order) return;

  
  // Beim Abbuchen gab es die Bestellung noch nicht, nur den Warenkorb.
  // Jetzt die Einlösungen dieses Warenkorbs der Bestellung zuordnen.
  const {
    data: [orderCart],
  } = await query.graph({
    entity: "order_cart",
    fields: ["cart_id"],
    filters: { order_id: order.id },
  });

  if (orderCart?.cart_id) 
  {
    const redemptions = await giftCards.listGiftCardRedemptions({
      cart_id: orderCart.cart_id,
      order_id: null,
    });
    if (redemptions.length > 0) 
    {
      await giftCards.updateGiftCardRedemptions(
        redemptions.map((r: any) => ({ id: r.id, order_id: order.id }))
      );
    }
  }

  const giftItems = (order.items ?? []).filter((item: any) =>
    isGiftCardProduct(item?.variant?.product?.metadata)
  );
  if (giftItems.length === 0) return;

  // Gibt es zu dieser Bestellung schon Karten? Dann nicht noch einmal
  // anlegen – z. B. falls das Ereignis ein zweites Mal ankommt.
  const existing = await giftCards.listGiftCards({ order_id: order.id }, { take: 1 });
  if (existing.length > 0) 
  {
    logger.info(`[Geschenkkarte] Bestellung ${order.display_id}: Karten gibt es schon, übersprungen.`);
    return;
  }

  const storeModuleService = container.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const validYears = readGiftCardValidYears(store?.metadata);

  let count = 0;
  for (const item of giftItems as any[]) 
  {
    const amountCents = Math.round(Number(item.unit_price) * 100);
    const quantity = Number(item.quantity);

    // Ohne gültige Menge oder Betrag lieber laut melden als still nichts tun –
    // sonst hat ein Kunde bezahlt und bekommt keine Karte.
    if (!Number.isInteger(quantity) || quantity < 1 || !(amountCents > 0)) 
    {
      logger.error(
        `[Geschenkkarte] Bestellung ${order.display_id}: Position ${item.id} hat ` +
          `ungültige Menge (${item.quantity}) oder Betrag (${item.unit_price}) – keine Karte angelegt!`
      );
      continue;
    }

    for (let i = 0; i < quantity; i++) 
    {
      await giftCards.issueGiftCard({
        amount_cents: amountCents,
        currency_code: order.currency_code,
        order_id: order.id,
        valid_years: validYears,
      });
      count++;
    }
  }

  logger.info(`[Geschenkkarte] Bestellung ${order.display_id}: ${count} Karte(n) angelegt.`);
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
