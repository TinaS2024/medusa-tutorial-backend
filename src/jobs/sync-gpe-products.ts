import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  readLastRun,
  readSyncSettings,
  runProductSyncExclusive,
} from "../lib/product-sync-schedule";

/** Spielraum, weil der Weckruf immer zur vollen Minute kommt. */
const TOLERANCE_MS = 30_000;

/**
 * Produkt-Abgleich GPE → Medusa (Pull), Abstand im Admin einstellbar.
 *
 * Der Zeitplan unten steht fest auf "jede Minute", denn ein Zeitplan im
 * Code wird nur beim Serverstart gelesen. Der Job ist deshalb nur ein
 * Weckruf: Er liest die Einstellungen und den letzten Lauf aus den
 * Store-Metadaten und entscheidet selbst, ob es Zeit ist. Ändert man im
 * Admin den Abstand, gilt das ab dem nächsten Weckruf, ohne Neustart.
 *
 * GPE-Fehler dürfen den Job nicht crashen. Sie werden geloggt, der nächste
 * Versuch kommt nach dem eingestellten Abstand.
 */
export default async function syncGpeProductsJob(container: MedusaContainer) 
{
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const storeModuleService = container.resolve(Modules.STORE);

  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  const settings = readSyncSettings(md);
  if (!settings.enabled) return;

  // Fällig? Gezählt wird ab dem START des letzten Laufs.
  const lastRun = readLastRun(md);
  if (lastRun) 
  {
    const dueAt = new Date(lastRun.started_at).getTime() + settings.interval_minutes * 60_000;
    if (Date.now() + TOLERANCE_MS < dueAt) return;
  }

  try {
    const result = await runProductSyncExclusive(
      container,
      { dry_run: false, sync_prices: settings.sync_prices },
      "schedule"
    );

    if (!result) 
    {
      logger.info("[gpe-sync] Ein Abgleich von Hand läuft gerade, dieser Weckruf wird übersprungen.");
      return;
    }

    if (result.message) 
    {
      logger.warn(`[gpe-sync] ${result.message}`);
      return;
    }

    logger.info(
      `[gpe-sync] fertig: ${result.updated.length} Produkt(e) abgeglichen, ` +
        `davon ${result.identity_updates ?? 0} geändert, ` +
        `${result.price_updates ?? 0} Variantenpreis(e) gesetzt, ` +
        `${result.not_found_in_gpe.length} nicht in GPE gefunden.`
    );
  } catch (err: any) {
    logger.error(`[gpe-sync] fehlgeschlagen: ${err?.message ?? err}`);
  }
}

export const config = {
  name: "sync-gpe-products",
  schedule: "* * * * *",
}
