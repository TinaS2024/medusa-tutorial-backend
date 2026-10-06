import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { runProductSync, type SyncOptions, type SyncResult } from "./sync-gpe-products";

/** Kleinster und größter erlaubter Abstand in Minuten (10080 = eine Woche). */
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 10080;

export type ProductSyncSettings = {
  enabled: boolean
  interval_minutes: number
  sync_prices: boolean
}

/** Was vom letzten Lauf in den Store-Metadaten steht. */
export type ProductSyncRun = {
  started_at: string
  finished_at: string
  trigger: "schedule" | "manual"
  ok: boolean
  matched: number
  identity_updates: number
  price_updates: number
  not_found: number
  message: string | null
  duration_ms: number
}

/**
 * Liest die Einstellungen aus den Store-Metadaten. Fehlt etwas, gilt das
 * bisherige Verhalten: eingeschaltet, einmal pro Woche, mit Preisen.
 */
export function readSyncSettings(md: Record<string, unknown> | null): ProductSyncSettings {
  const interval = Number(md?.product_sync_interval_minutes);
  return {
    enabled: typeof md?.product_sync_enabled === "boolean" ? md.product_sync_enabled : true,
    interval_minutes:
      Number.isInteger(interval) && interval >= MIN_INTERVAL_MINUTES && interval <= MAX_INTERVAL_MINUTES
        ? interval
        : MAX_INTERVAL_MINUTES,
    sync_prices: typeof md?.product_sync_prices === "boolean" ? md.product_sync_prices : true,
  }
}

export function readLastRun(md: Record<string, unknown> | null): ProductSyncRun | null {
  const run = md?.product_sync_last_run as ProductSyncRun | undefined;
  return run && typeof run.started_at === "string" ? run : null;
}

/**
 * Merkt sich, ob gerade ein Abgleich arbeitet. Job und Admin-Knopf fragen
 * beide hier nach, damit nie zwei Läufe gleichzeitig gegen GPE gehen.
 *
 * Das ist eine einfache Variable im laufenden Programm. Sie genügt, weil
 * Medusa als EIN Prozess läuft. Kommt je ein zweiter Prozess dazu, muss die
 * Sperre in die Datenbank wandern.
 */
let running = false;
export const isSyncRunning = () => running;

/**
 * Schreibt den Laufbericht in die Store-Metadaten.
 *
 * Wichtig: Der Store wird HIER frisch gelesen, nicht zu Beginn des Laufs.
 * Medusa ersetzt die Metadaten beim Speichern komplett. Hätte jemand
 * während des Laufs im Admin etwas gespeichert, würde der alte Stand das
 * wieder überschreiben.
 */
async function saveLastRun(container: MedusaContainer, run: ProductSyncRun) {
  const storeModuleService = container.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  if (!store) return;

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  await storeModuleService.updateStores(
    { id: store.id },
    { metadata: { ...prev, product_sync_last_run: run } }
  );
}

/**
 * Startet runProductSync, aber nur, wenn gerade kein anderer Lauf arbeitet.
 * Gibt null zurück, wenn schon einer läuft.
 *
 * Als "letzter Lauf" zählt nur ein echter Lauf über alle Produkte. Ein
 * Probelauf (dry_run) oder ein Lauf für einzelne Produkte verschiebt den
 * nächsten automatischen Lauf nicht.
 */
export async function runProductSyncExclusive(
  container: MedusaContainer,
  options: SyncOptions,
  trigger: ProductSyncRun["trigger"]
): Promise<SyncResult | null> {
  if (running) return null;
  running = true;

  const started = new Date();
  const record = !options.dry_run && !options.product_ids?.length;

  try {
    const result = await runProductSync(container, options);

    if (record) 
    {
      await saveLastRun(container, {
        started_at: started.toISOString(),
        finished_at: new Date().toISOString(),
        trigger,
        ok: true,
        matched: result.updated.length,
        identity_updates: result.identity_updates ?? 0,
        price_updates: result.price_updates ?? 0,
        not_found: result.not_found_in_gpe.length,
        message: result.message ?? null,
        duration_ms: Date.now() - started.getTime(),
      });
    }
    return result;
  } catch (err: any) 
  {
    // Auch ein Fehlschlag zählt als Lauf. Sonst würde der Job bei einem
    // GPE-Ausfall jede Minute erneut anklopfen.
    if (record) 
    {
      await saveLastRun(container, {
        started_at: started.toISOString(),
        finished_at: new Date().toISOString(),
        trigger,
        ok: false,
        matched: 0,
        identity_updates: 0,
        price_updates: 0,
        not_found: 0,
        message: err?.message ?? String(err),
        duration_ms: Date.now() - started.getTime(),
      });
    }
    throw err;
  } finally {
    running = false;
  }
}
