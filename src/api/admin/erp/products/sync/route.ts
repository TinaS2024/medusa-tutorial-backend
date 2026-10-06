import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { SyncOptions } from "../../../../../lib/sync-gpe-products";
import { runProductSyncExclusive } from "../../../../../lib/product-sync-schedule";


/**
 * Produkt-Sync (manueller Auslöser): reichert Medusa-Produkte um die
 * GPE-Identität an UND schreibt den GPE-Basispreis in den Medusa-Variantenpreis.
 *
 *   POST /admin/erp/products/sync
 *   Body (optional): { product_ids?: string[], dry_run?: boolean, sync_prices?: boolean }
 *
 * Kernlogik in src/lib/sync-gpe-products.ts – geteilt mit dem wöchentlichen
 * Scheduled Job (src/jobs/sync-gpe-products.ts).
 */
export async function POST(req: MedusaRequest<SyncOptions>, res: MedusaResponse) 
{
    try {
    const result = await runProductSyncExclusive(req.scope, req.body ?? {}, "manual");
    if (!result) 
    {
      // 409 = "Konflikt": Es läuft schon ein Abgleich.
      res.status(409).json({ message: "Der Abgleich läuft gerade schon. Bitte in ein paar Minuten noch einmal versuchen." });
      return;
    }
    res.json(result);
  } catch (err: any) 
  {
    res.status(502).json({ message: err?.message ?? "GPE-Aufruf fehlgeschlagen" });
  }
}
