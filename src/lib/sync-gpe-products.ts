import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { ERP_MODULE } from "../modules/erp";
import type ErpModuleService from "../modules/erp/service";
import type { GpeProduct } from "../modules/erp/client/types";

export type SyncOptions = {
  product_ids?: string[]
  dry_run?: boolean
  sync_prices?: boolean
}

export type SyncResult = {
  dry_run: boolean
  message?: string
  currency?: string
  candidates?: number
  updated: {
    product_id: string
    gpe_name: string
    gpe_id: number
    base_price: number | null
  }[]
  not_found_in_gpe: { product_id: string; gpe_name: string }[]
  price_updates?: number
  skipped_without_gpe_name?: number
}

/**
 * Kernlogik des Produkt-Syncs – ohne HTTP, damit sie sowohl die Admin-Route
 * (POST /admin/erp/products/sync) als auch der wöchentliche Scheduled Job
 * (src/jobs/sync-gpe-products.ts) teilen. Wirft bei GPE-Fehlern; der Aufrufer
 * entscheidet, ob daraus ein 502 (Route) oder ein Log-Eintrag (Job) wird.
 */
export async function runProductSync(container: MedusaContainer,options: SyncOptions = {}): Promise<SyncResult> 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);
  const erp: ErpModuleService = container.resolve(ERP_MODULE);

  const { product_ids, dry_run = false, sync_prices = true } = options;

  // Region-Währung für den Variantenpreis. GPE liefert EUR.
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["currency_code"],
  })
  const currency = regions[0]?.currency_code ?? "eur";

  // 1. Kandidaten: Produkte mit gpe_name (inkl. Varianten für den Preis-Sync)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata", "variants.id"],
    ...(product_ids?.length ? { filters: { id: product_ids } } : {}),
  })

  const candidates = products.filter((p: any) => {
    const n = p.metadata?.gpe_name;
    return (typeof n === "string" || typeof n === "number") && String(n).trim() !== "";
  })

  if (candidates.length === 0) 
{
    return {
      dry_run,
      message:
        "Keine Produkte mit metadata.gpe_name gefunden. Erst die GPE-Artikelnummer am Produkt setzen.",
      updated: [],
      not_found_in_gpe: [],
      skipped_without_gpe_name: products.length,
    }
  }

  const names = [
    ...new Set(candidates.map((p: any) => String(p.metadata.gpe_name).trim())),
  ]

  // 2. GPE-Stammdaten holen (wirft bei GPE-Fehler → Aufrufer behandelt)
  const gpeProducts = await erp.getProductsByNames(names);
  const gpeByName = new Map<string, GpeProduct>();
  for (const g of gpeProducts) 
{
    gpeByName.set(String(g.name), g)
  }

  // 3. Zuordnen: Identität schreiben + GPE-Basispreis holen
  const updated: SyncResult["updated"] = [];
  const notFound: SyncResult["not_found_in_gpe"] = [];
  const priceUpdates: { variantId: string; amount: number }[] = [];

  for (const p of candidates) 
    {
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const gpeName = String(meta.gpe_name).trim();
    const gpe = gpeByName.get(gpeName);

    if (!gpe) 
    {
      notFound.push({ product_id: p.id, gpe_name: gpeName });
      continue;
    }

    const nextMetadata = {
      ...meta,
      gpe_id: gpe.id,
      gpe_name: gpe.name,
      gpe_external_id: gpe.externalID ?? null,
    }
    if (!dry_run) 
    {
      await productModule.updateProducts(p.id, { metadata: nextMetadata });
    }

    // GPE-Basispreis (ohne Optionen, ohne Kunde) = "ab"-Preis für die Galerie
    let basePrice: number | null = null;
    if (sync_prices) 
    {
      const info = await erp.getProductInfo({
        product: {
          gpe_id: Number(gpe.id),
          gpe_name: String(gpe.name),
          externalID: gpe.externalID,
        },
        count: 1,
        useDefaultOptionValues: false,
      })
      const price = (info as any)?.Product?.settings?.price;
      if (typeof price === "number" && Number.isFinite(price)) 
        {
        basePrice = price;
        for (const v of p.variants ?? []) 
        {
          priceUpdates.push({ variantId: v.id, amount: price })
        }
      }
    }

    updated.push({
      product_id: p.id,
      gpe_name: gpeName,
      gpe_id: gpe.id,
      base_price: basePrice,
    })
  }

  // 4. Variantenpreise setzen (ein Workflow-Aufruf für alle)
  if (!dry_run && priceUpdates.length > 0) 
{
    await updateProductVariantsWorkflow(container).run({
      input: {
        product_variants: priceUpdates.map((u) => ({
          id: u.variantId,
          prices: [{ amount: u.amount, currency_code: currency }],
        })),
      },
    })
  }

  return {
    dry_run,
    currency,
    candidates: candidates.length,
    updated,
    not_found_in_gpe: notFound,
    price_updates: priceUpdates.length,
  }
}
