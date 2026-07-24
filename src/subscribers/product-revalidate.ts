import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Meldet dem Storefront, dass sich Produkte geändert haben, damit es seinen
 * Produkt-/Bundle-Cache invalidiert (On-Demand-Revalidation). Ersetzt das
 * manuelle .next-Löschen + Neustart. Fehlertolerant: fehlen die Env-Variablen
 * oder ist das Storefront nicht erreichbar, wird nur geloggt (kein Crash).
 */
export default async function productRevalidateSubscriber({ container,}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    const url = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_STOREFRONT_URL;
    const secret = process.env.REVALIDATE_SECRET || process.env.NEXT_PUBLIC_REVALIDATE_SECRET;


  if (!url || !secret) 
    {
    logger.warn(
      "[revalidate] STOREFRONT_URL oder REVALIDATE_SECRET fehlt in der .env – übersprungen."
    )
    return;
  }

  try {
    const res = await fetch(`${url}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tags: ["products", "bundles"] }),
    })
    if (!res.ok) {
      logger.warn(`[revalidate] Storefront antwortete HTTP ${res.status}`);
      return
    }
    logger.info("[revalidate] Storefront-Produktcache invalidiert.");
  } catch (err: any) 
  {
    logger.warn(`[revalidate] Storefront nicht erreichbar: ${err?.message ?? err}`);
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
}
