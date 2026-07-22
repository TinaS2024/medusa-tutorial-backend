import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { runProductSync } from "../lib/sync-gpe-products";

/**
 * Wöchentlicher Produkt-Sync GPE → Medusa (Pull). Läuft dieselbe Logik wie die
 * Admin-Route POST /admin/erp/products/sync, nur automatisch statt per Knopf.
 *
 * Zeitplan "0 3 * * 1" = jeden Montag 03:00 Uhr
 * (Cron-Felder: Minute Stunde Tag-des-Monats Monat Wochentag; 1 = Montag).
 *
 * GPE-Fehler dürfen den Job nicht crashen – sie werden geloggt, der nächste
 * Lauf versucht es erneut.
 */
export default async function syncGpeProductsJob(container: MedusaContainer) 
{
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const result = await runProductSync(container, {
      dry_run: false,
      sync_prices: true,
    })

    if (result.message) {
      logger.warn(`[gpe-sync] ${result.message}`)
      return
    }

    logger.info(
      `[gpe-sync] fertig: ${result.updated.length} Produkt(e) aktualisiert, ` +
        `${result.price_updates ?? 0} Variantenpreis(e) gesetzt, ` +
        `${result.not_found_in_gpe.length} nicht in GPE gefunden.`
    )
  } catch (err: any) {
    logger.error(`[gpe-sync] fehlgeschlagen: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "sync-gpe-products",
  schedule: "0 3 * * 1",
}
