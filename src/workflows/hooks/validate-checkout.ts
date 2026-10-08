import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import { INVOICE_PAYMENT_PROVIDER_ID, readCustomerNumber } from "../../lib/customer-number";
import {
  GIFT_CARD_CREDIT_REFERENCE,
  isGiftCardProduct,
  isInstantPayment,
} from "../../lib/gift-card";
import { GIFT_CARD_MODULE } from "../../modules/gift-card";
import type GiftCardModuleService from "../../modules/gift-card/service";

/**
 * Alle Prüfungen beim Bestellabschluss.
 *
 * Medusa erlaubt pro Prüfpunkt nur EINE Prüffunktion ("Cannot define
 * multiple hook handlers"). Deshalb stehen alle Prüfungen in dieser Datei
 * und werden ganz unten nacheinander aufgerufen. Neue Prüfungen hier
 * ergänzen – nicht in einer eigenen Datei.
 */

/**
 * Kauf auf Rechnung nur für Kunden mit Kundennummer.
 *
 * has_account: Bei einer Gastbestellung legt Medusa einen eigenen
 * Gast-Kundensatz an. Der hat nie eine Kundennummer – zur Sicherheit wird
 * trotzdem ausdrücklich ein echtes Kundenkonto verlangt.
 */
function checkInvoicePayment(cart: any) 
{
  const sessions: any[] = cart.payment_collection?.payment_sessions ?? [];
  const paysByInvoice = sessions.some(
    (session) => session?.provider_id === INVOICE_PAYMENT_PROVIDER_ID
  );

  if (!paysByInvoice) return;

  const customer = cart.customer;

  if (!customer?.has_account || !readCustomerNumber(customer.metadata)) 
  {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Kauf auf Rechnung ist nur für freigeschaltete Kundenkonten möglich. Bitte wählen Sie eine andere Zahlungsart."
    );
  }
}

/**
 * Geschenkkarten nur mit Sofortzahlung (Karte, PayPal). Der Code entsteht
 * direkt beim Bestellen – bei Vorauszahlung, Rechnung oder Lastschrift
 * hätte der Käufer ihn, bevor das Geld sicher da ist.
 */
async function checkGiftCardPurchase(cart: any, container: any) 
{
  const productIds = [
    ...new Set((cart.items ?? []).map((item: any) => item?.product_id).filter(Boolean)),
  ] as string[];

  if (productIds.length === 0) return;

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productIds },
  });

  const containsGiftCard = products.some((product: any) => isGiftCardProduct(product.metadata));
  if (!containsGiftCard) return;

  const sessions: any[] = cart.payment_collection?.payment_sessions ?? [];
  const paysInstantly =
    sessions.length > 0 && sessions.every((session) => isInstantPayment(session?.provider_id));

  if (!paysInstantly) 
  {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Geschenkkarten können nur mit Karte bezahlt werden. Bitte wählen Sie eine andere Zahlungsart."
    );
  }

  // Zusätzlich muss die Stripe-Zahlung auf sofort bestätigte Arten
  // beschränkt sein (Karte, PayPal). Sonst ließe sich im Stripe-Feld auch
  // SEPA-Lastschrift wählen – die ist erst nach Tagen sicher und kann
  // zurückgebucht werden. Medusa speichert, welche Arten Stripe erlaubt hat.
  const allowedTypes = ["card", "paypal"];
  const instantOnly = sessions.every((session) => {
    const types = session?.data?.payment_method_types;
    return (
      Array.isArray(types) &&
      types.length > 0 &&
      types.every((type: string) => allowedTypes.includes(type))
    );
  });

  if (!instantOnly) 
  {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Geschenkkarten können nur mit Karte oder PayPal bezahlt werden. Bitte wählen Sie die Zahlungsart erneut aus."
    );
  }
}

/**
 * Bucht das Guthaben aller eingelösten Geschenkkarten ab.
 *
 * Gibt die ids der neuen Einlösungen zurück. Mit ihnen kann Medusa das
 * Abbuchen rückgängig machen, falls die Bestellung danach noch scheitert.
 */
async function redeemGiftCards(cart: any, container: any): Promise<string[]> 
{
  const lines = (cart.credit_lines ?? []).filter(
    (line: any) => line?.reference === GIFT_CARD_CREDIT_REFERENCE
  );
  if (lines.length === 0) return [];

  // Wurde der Warenkorb nach dem Einlösen billiger (Artikel entfernt),
  // kann die Gutschrift höher sein als der Warenkorb.
  // Halber Cent Spielraum: Kommazahlen sind nie ganz exakt.
  if (Number(cart.total) < -0.005) 
  {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Der Warenkorb hat sich geändert. Bitte entfernen Sie die Geschenkkarte und lösen Sie sie erneut ein."
    );
  }

  const giftCards: GiftCardModuleService = container.resolve(GIFT_CARD_MODULE);
  const created: string[] = [];

  try {
    for (const line of lines) 
    {
      const id = await giftCards.redeemForCart({
        gift_card_id: line.reference_id,
        cart_id: cart.id,
        amount_cents: Math.round(Number(line.amount) * 100),
      });
      if (id) created.push(id);
    }
  } catch (err) {
    // Bei zwei Karten kann die erste schon abgebucht sein, wenn die zweite
    // scheitert. Die Rücknahme-Funktion unten läuft aber nur, wenn DIESER
    // Schritt erfolgreich war – deshalb hier sofort selbst zurückgeben.
    await giftCards.undoRedemptions(created);
    throw err;
  }

  return created;
}

completeCartWorkflow.hooks.validate(
  async ({ cart }, { container }) => {
    checkInvoicePayment(cart);
    await checkGiftCardPurchase(cart, container);

    // Abbuchen ganz zum Schluss: Scheitert vorher eine Prüfung, soll nichts
    // abgebucht sein.
    const redemptionIds = await redeemGiftCards(cart, container);

    // Der zweite Wert geht an die Rücknahme-Funktion darunter.
    return new StepResponse(undefined, redemptionIds);
  },
  // Rücknahme: Scheitert die Bestellung NACH dieser Prüfung (z. B. Zahlung
  // abgelehnt), bekommt die Karte ihr Guthaben zurück.
  async (redemptionIds, { container }) => {
    if (!redemptionIds?.length) return;
    const giftCards: GiftCardModuleService = container.resolve(GIFT_CARD_MODULE);
    await giftCards.undoRedemptions(redemptionIds);
  }
);
