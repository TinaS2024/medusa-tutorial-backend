/** Wie lange eine Karte gilt, wenn im Admin nichts eingestellt ist. */
export const DEFAULT_GIFT_CARD_VALID_YEARS = 3;

/**
 * Ist dieses Produkt eine Geschenkkarte? Erkannt an metadata.is_giftcard.
 *
 * Achtung, Namensgleichheit: Medusa hat ein eigenes Feld is_giftcard direkt
 * am Produkt. Das lässt sich im Admin aber nicht setzen und bleibt immer
 * false. Gemeint ist hier der gleichnamige Eintrag in den METADATEN.
 *
 * Der Admin speichert Metadaten als Text, daher wird auch "true" akzeptiert.
 */
export const isGiftCardProduct = (metadata: unknown): boolean => {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.is_giftcard;
  return raw === true || raw === "true";
};

/** Gültigkeit in Jahren aus den Store-Metadaten (Einstellung kommt in G8). */
export const readGiftCardValidYears = (storeMetadata: unknown): number => {
  const raw = Number((storeMetadata as Record<string, unknown> | null | undefined)?.gift_card_valid_years);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_GIFT_CARD_VALID_YEARS;
};

/**
 * Sofortzahlung über Stripe (Karte usw.)? Nur damit dürfen Geschenkkarten
 * gekauft werden – der Code entsteht beim Bestellen, also muss das Geld
 * dann schon da sein.
 */
export const isInstantPayment = (providerId: unknown): boolean =>
  typeof providerId === "string" && providerId.startsWith("pp_stripe");


/**
 * Kennzeichen an der Gutschrift im Warenkorb (credit line). Daran erkennen
 * wir später, welche Gutschriften von Geschenkkarten stammen.
 */
export const GIFT_CARD_CREDIT_REFERENCE = "gift_card";

/**
 * Bringt eine Eingabe in die feste Form "GK-XXXX-XXXX-XXXX".
 *
 * Kunden tippen Codes oft klein, ohne Bindestriche oder mit Leerzeichen ab.
 * Gibt "" zurück, wenn es gar kein Geschenkkarten-Code sein kann.
 */
export const normalizeGiftCardCode = (input: unknown): string => {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 14 || !raw.startsWith("GK")) return "";
  return `GK-${raw.slice(2, 6)}-${raw.slice(6, 10)}-${raw.slice(10, 14)}`;
};


/**
 * Eine Geschenkkarte so, wie der Admin sie bekommt: Beträge in Euro statt
 * Cent. Steht hier, damit alle Admin-Routen dieselbe Form liefern.
 */
export const giftCardToDto = (card: any) => ({
  id: card.id,
  code: card.code,
  initial_amount: card.initial_amount_cents / 100,
  balance: card.balance_cents / 100,
  currency_code: card.currency_code,
  expires_at: card.expires_at,
  is_disabled: card.is_disabled,
  order_id: card.order_id,
  created_at: card.created_at,
});
