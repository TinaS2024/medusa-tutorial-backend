import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  isSyncRunning,
  readLastRun,
  readSyncSettings,
  type ProductSyncRun,
  type ProductSyncSettings,
} from "../../../lib/product-sync-schedule";

type ProductSyncResponse = {
  product_sync: ProductSyncSettings & {
    running: boolean
    last_run: ProductSyncRun | null
    next_run_at: string | null
  }
}

/** Baut die Antwort; den nächsten Lauf rechnen wir hier aus, nicht im Browser. */
const toResponse = (md: Record<string, unknown> | null): ProductSyncResponse => {
  const settings = readSyncSettings(md);
  const last_run = readLastRun(md);
  const next_run_at =
    settings.enabled && last_run
      ? new Date(new Date(last_run.started_at).getTime() + settings.interval_minutes * 60_000).toISOString()
      : null;

  return { product_sync: { ...settings, running: isSyncRunning(), last_run, next_run_at } };
}

export async function GET(req: MedusaRequest, res: MedusaResponse<ProductSyncResponse>) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  res.json(toResponse((store?.metadata as Record<string, unknown> | null) ?? null));
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse<ProductSyncResponse | { message: string }>
) {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) 
  {
    res.status(400).json({ message: "Kein Store gefunden" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const interval = Number(body.interval_minutes);

  if (!Number.isInteger(interval) || interval < MIN_INTERVAL_MINUTES || interval > MAX_INTERVAL_MINUTES) 
  {
    res.status(400).json({
      message: `Der Abstand muss eine ganze Zahl zwischen ${MIN_INTERVAL_MINUTES} und ${MAX_INTERVAL_MINUTES} Minuten sein.`,
    });
    return;
  }

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  const metadata = {
    ...prev,
    product_sync_enabled: body.enabled === true,
    product_sync_interval_minutes: interval,
    product_sync_prices: body.sync_prices === true,
  }

  await storeModuleService.updateStores({ id: store.id }, { metadata });
  res.json(toResponse(metadata));
}
