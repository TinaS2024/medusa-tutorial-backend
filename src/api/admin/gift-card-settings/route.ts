import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { readGiftCardValidYears } from "../../../lib/gift-card";

/**
 * Gültigkeit neuer Geschenkkarten in Jahren (ab Ende des Kaufjahres).
 * Liegt in den Store-Metadaten unter gift_card_valid_years.
 *
 *   GET  /admin/gift-card-settings
 *   POST /admin/gift-card-settings   Body: { valid_years: 3 }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  res.json({ valid_years: readGiftCardValidYears(store?.metadata) });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const body = (req.body ?? {}) as Record<string, unknown>;
  const validYears = Number(body.valid_years);

  if (!Number.isInteger(validYears) || validYears < 1 || validYears > 30) 
  {
    res.status(400).json({ message: "Die Gültigkeit muss eine ganze Zahl zwischen 1 und 30 Jahren sein." });
    return;
  }

  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  if (!store) 
  {
    res.status(400).json({ message: "Kein Store gefunden." });
    return;
  }

  // Frisch gelesene Metadaten weitergeben – Medusa ersetzt sie beim Speichern komplett.
  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  await storeModuleService.updateStores(
    { id: store.id },
    { metadata: { ...prev, gift_card_valid_years: validYears } }
  );

  res.json({ valid_years: validYears });
}
