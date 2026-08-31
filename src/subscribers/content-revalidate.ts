import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Meldet dem Storefront, dass sich Kategorien, Kollektionen, Schlagwörter,
 * Produktarten oder Übersetzungen geändert haben.
 *
 * Getrennt von product-revalidate.ts, weil andere Tags betroffen sind. Das
 * wichtigste Ereignis ist "translation.updated": Beim Pflegen einer
 * Übersetzung im Admin ändert sich die Kategorie selbst nicht, es feuert also
 * kein product-category.updated. Ohne diesen Eintrag bliebe der Storefront-
 * Cache mit den alten Namen stehen.
 *
 * Fehlertolerant: Fehlen die Env-Variablen oder ist das Storefront nicht
 * erreichbar, wird nur geloggt.
 */
export default async function contentRevalidateSubscriber({ container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const url = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_STOREFRONT_URL;
  const secret = process.env.REVALIDATE_SECRET || process.env.NEXT_PUBLIC_REVALIDATE_SECRET;

  if (!url || !secret) 
  {
    logger.warn(
      "[revalidate] STOREFRONT_URL oder REVALIDATE_SECRET fehlt in der .env – übersprungen."
    );
    return;
  }

  try {
    const res = await fetch(`${url}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      // Übersetzungen betreffen auch Produktnamen, deshalb "products" mit.
      body: JSON.stringify({ tags: ["categories", "collections", "products"] }),
    });

    if (!res.ok) 
    {
      logger.warn(`[revalidate] Storefront antwortete HTTP ${res.status}`);
      return;
    }

    logger.info("[revalidate] Storefront-Inhaltscache invalidiert.");
  } catch (err: any) 
  {
    logger.warn(`[revalidate] Storefront nicht erreichbar: ${err?.message ?? err}`);
  }
}

export const config: SubscriberConfig = {
  event: [
    "translation.created",
    "translation.updated",
    "translation.deleted",
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
    "product-collection.created",
    "product-collection.updated",
    "product-collection.deleted",
    "product-tag.created",
    "product-tag.updated",
    "product-tag.deleted",
    "product-type.created",
    "product-type.updated",
    "product-type.deleted",
  ],
};

