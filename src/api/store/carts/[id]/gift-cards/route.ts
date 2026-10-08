import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createCartCreditLinesWorkflow, refreshPaymentCollectionForCartWorkflow} from "@medusajs/medusa/core-flows";
import { GIFT_CARD_MODULE } from "../../../../../modules/gift-card";
import type GiftCardModuleService from "../../../../../modules/gift-card/service";
import { GIFT_CARD_CREDIT_REFERENCE, isGiftCardProduct, normalizeGiftCardCode} from "../../../../../lib/gift-card";

/**
 * Löst eine Geschenkkarte im Warenkorb ein.
 *
 *   POST /store/carts/:id/gift-cards
 *   Body: { code: "GK-7KQM-R4XT-9HWP" }
 *
 * Legt eine Gutschrift (credit line) an – höchstens bis zum Restguthaben
 * und höchstens bis zum offenen Betrag. Eine Gutschrift wirkt wie eine
 * Zahlung: Sie senkt den Betrag, aber NICHT die Steuer (Mehrzweckgutschein).
 *
 * Abgebucht wird hier noch nichts – das passiert erst beim Bestellen (G5).
 */
export async function POST(req: MedusaRequest<{ code?: string }>, res: MedusaResponse) 
{
  const code = normalizeGiftCardCode(req.body?.code);
  if (!code) 
  {
    res.status(400).json({ message: "Das ist kein gültiger Geschenkkarten-Code." });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    // Alles, woraus Medusa "total" berechnet – fehlt etwas davon, rechnet es
    // mit 0 und der offene Betrag stimmt nicht (vorher kam nur der Versand heraus).
    fields: [
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
    ],
    filters: { id: req.params.id },
  });

  if (!cart || cart.completed_at) 
  {
    res.status(404).json({ message: "Warenkorb nicht gefunden." });
    return;
  }

  // Eine Geschenkkarte mit einer Geschenkkarte zu bezahlen, ergibt keinen Sinn.
  if ((cart.items ?? []).some((item: any) => isGiftCardProduct(item?.product?.metadata))) 
  {
    res.status(400).json({ message: "Geschenkkarten können nicht mit einer Geschenkkarte bezahlt werden." });
    return;
  }

  const giftCards: GiftCardModuleService = req.scope.resolve(GIFT_CARD_MODULE);
  const [card] = await giftCards.listGiftCards({ code }, { take: 1 });

  // Unbekannt und gesperrt bekommen dieselbe Meldung – wer Codes ausprobiert,
  // soll nicht erfahren, dass es einen Code gibt.
  if (!card || card.is_disabled) 
  {
    res.status(400).json({ message: "Diese Geschenkkarte ist nicht gültig." });
    return;
  }

  if (card.expires_at && new Date(card.expires_at as any).getTime() < Date.now()) 
  {
    res.status(400).json({ message: "Diese Geschenkkarte ist abgelaufen." });
    return;
  }

  if (card.currency_code !== cart.currency_code) 
  {
    res.status(400).json({ message: "Diese Geschenkkarte gilt nicht für diese Währung." });
    return;
  }

  if (card.balance_cents <= 0) 
  {
    res.status(400).json({ message: "Das Guthaben dieser Geschenkkarte ist aufgebraucht." });
    return;
  }

  const alreadyApplied = (cart.credit_lines ?? []).some(
    (line: any) => line?.reference === GIFT_CARD_CREDIT_REFERENCE && line?.reference_id === card.id
  );
  if (alreadyApplied) 
  {
    res.status(400).json({ message: "Diese Geschenkkarte ist bereits eingelöst." });
    return;
  }

  // Höchstens so viel, wie noch zu zahlen ist – der Rest bleibt auf der Karte.
  // Genau rechnen, nicht auf Cent runden (siehe lib/gift-card-credits.ts).
  // total ist ein berechnetes Feld und fehlt in der TypeScript-Beschreibung.
  const open = Number((cart as any).total);
  if (!(open > 0.005)) 
  {
    res.status(400).json({ message: "Es ist nichts mehr zu bezahlen." });
    return;
  }
  const amount = Math.min(card.balance_cents / 100, open);

  await createCartCreditLinesWorkflow(req.scope).run({
    input: [
      {
        cart_id: cart.id,
        amount: amount,
        reference: GIFT_CARD_CREDIT_REFERENCE,
        reference_id: card.id,
        metadata: { code },
      },
    ],
  });

  // Der zu zahlende Betrag hat sich geändert. Bereits angelegte Zahlungen
  // (z. B. bei Stripe) kennen noch den alten – deshalb neu berechnen lassen.
  await refreshPaymentCollectionForCartWorkflow(req.scope).run({
    input: { cart_id: cart.id },
  });

  res.json({ applied: amount});
}
