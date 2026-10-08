import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createCartCreditLinesWorkflow,
  deleteCartCreditLinesWorkflow,
  refreshPaymentCollectionForCartWorkflow,
} from "@medusajs/medusa/core-flows";
import { GIFT_CARD_MODULE } from "../modules/gift-card";
import type GiftCardModuleService from "../modules/gift-card/service";
import { GIFT_CARD_CREDIT_REFERENCE } from "./gift-card";

/** Alles, woraus Medusa den Gesamtbetrag eines Warenkorbs berechnet. */
export const CART_TOTAL_FIELDS = [
  "id",
  "currency_code",
  "completed_at",
  "total",
  "items.*",
  "items.tax_lines.*",
  "items.adjustments.*",
  "items.product.metadata",
  "shipping_methods.*",
  "shipping_methods.tax_lines.*",
  "shipping_methods.adjustments.*",
  "credit_lines.*",
];

/**
 * Rechnet die Gutschriften aller eingelösten Geschenkkarten neu aus:
 * jeweils so viel wie möglich, höchstens das Restguthaben.
 *
 * Nötig, weil sich der Warenkorb nach dem Einlösen noch ändert – vor allem
 * kommt an der Kasse der Versand dazu. Ohne Neuberechnung bliebe die
 * Gutschrift beim Betrag von damals stehen.
 *
 * Gibt zurück, ob sich etwas geändert hat. Nur dann werden die Zahlungen
 * neu angelegt – ein schon gewähltes Stripe-Feld bleibt sonst bestehen.
 */
export async function syncGiftCardCredits(
  container: MedusaContainer,
  cartId: string
): Promise<{ changed: boolean }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: CART_TOTAL_FIELDS,
    filters: { id: cartId },
  });

  if (!cart || cart.completed_at) return { changed: false };

  // any[]: Medusa beschreibt Einträge der Liste als "möglicherweise leer".
  // Das filter() darunter wirft leere Einträge ohnehin heraus (line?.reference).
  const lines: any[] = (cart.credit_lines ?? []).filter(

    (line: any) => line?.reference === GIFT_CARD_CREDIT_REFERENCE
  );
  if (lines.length === 0) return { changed: false };

  // Mit GENAUEN Beträgen rechnen, nicht auf Cent gerundet: Medusa rechnet
  // Steuern mit mehr Nachkommastellen. Eine auf Cent gerundete Gutschrift
  // kann um Bruchteile eines Cents größer sein als der Warenkorb – dann
  // rutscht der Gesamtbetrag unter 0. Auf Cent gerundet wird erst beim
  // Abbuchen von der Karte.

  // Offener Betrag OHNE Geschenkkarten = jetziger Betrag + ihre Gutschriften.
  let open =
    Number((cart as any).total) +
    lines.reduce((sum: number, line: any) => sum + Number(line.amount), 0);

  const giftCards: GiftCardModuleService = container.resolve(GIFT_CARD_MODULE);
  const now = Date.now();

  const planned: { line: any; amount: number }[] = [];
  for (const line of lines) 
  {
    // Ohne Kennung gibt es keine Karte dazu – die Gutschrift fällt weg.
    if (!line.reference_id) 
    {
      planned.push({ line, amount: 0 });
      continue;
    }

    const [card] = await giftCards.listGiftCards({ id: line.reference_id }, { take: 1 });

    const usable =
      card &&
      !card.is_disabled &&
      card.balance_cents > 0 &&
      (!card.expires_at || new Date(card.expires_at as any).getTime() > now);

    const amount = usable ? Math.max(0, Math.min(card.balance_cents / 100, open)) : 0;
    open -= amount;
    planned.push({ line, amount });
  }

  // Winzige Unterschiede durch Kommazahlen-Rechnung zählen nicht als Änderung.
  const changed = planned.some((p) => Math.abs(p.amount - Number(p.line.amount)) > 0.000001);
  if (!changed) return { changed: false };


  await deleteCartCreditLinesWorkflow(container).run({
    input: { id: lines.map((line: any) => line.id) },
  });

  const keep = planned.filter((p) => p.amount > 0);
  if (keep.length > 0) 
  {
    await createCartCreditLinesWorkflow(container).run({
      input: keep.map((p) => ({
        cart_id: cart.id,
        amount: p.amount,
        reference: GIFT_CARD_CREDIT_REFERENCE,
        reference_id: p.line.reference_id,
        metadata: p.line.metadata ?? {},
      })),
    });
  }

  await refreshPaymentCollectionForCartWorkflow(container).run({
    input: { cart_id: cart.id },
  });

  return { changed: true };
}
