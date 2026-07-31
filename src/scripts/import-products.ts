import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createProductsWorkflow, createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { join } from "path";

// Wohin die Bild-URLs zeigen sollen (Server-Backend). Bei Bedarf anpassen.
const SERVER_BACKEND_URL = "https://shop-api.bolasys.de";

const rewriteUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  // ersetzt den Origin (localhost:9000 / IP) durch den Server
  return url.replace(/^https?:\/\/[^/]+/, SERVER_BACKEND_URL);
};

const dedupePrices = (prices: any[] = []) => {
  const seen = new Map<string, any>();
  for (const p of prices) {
    if (!seen.has(p.currency_code)) {
      seen.set(p.currency_code, { amount: p.amount, currency_code: p.currency_code });
    }
  }
  return Array.from(seen.values());
};

export default async function importProducts({ container }: { container: any }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModule = container.resolve(Modules.PRODUCT);

  const raw = await fs.readFile(join(process.cwd(), "products-export.json"), "utf-8");
  const products: any[] = JSON.parse(raw);
  logger.info(`[import] ${products.length} Produkte aus JSON geladen.`);

  // Default Sales Channel des Servers
  const { data: [store] } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id"],
  });
  const salesChannelId = store?.default_sales_channel_id;
  if (!salesChannelId) throw new Error("Kein Default Sales Channel gefunden.");

  // Default Shipping Profile
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "type"],
  });
  const shippingProfileId =
    profiles.find((p: any) => p.type === "default")?.id ?? profiles[0]?.id;
  if (!shippingProfileId) throw new Error("Kein Shipping Profile gefunden.");

  // Kategorien: bestehende laden, fehlende anlegen
  const wantedCats = new Map<string, string>(); // handle -> name
  for (const p of products)
    for (const c of p.categories ?? []) if (c?.handle) wantedCats.set(c.handle, c.name);

  const { data: existingCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  });
  const catByHandle = new Map<string, string>(existingCats.map((c: any) => [c.handle, c.id]));
  const missing = [...wantedCats.entries()].filter(([h]) => !catByHandle.has(h));
  if (missing.length) {
    const { result: created } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: missing.map(([handle, name]) => ({ name, handle, is_active: true })) },
    });
    for (const c of created) catByHandle.set(c.handle, c.id);
    logger.info(`[import] ${created.length} fehlende Kategorien angelegt.`);
  }

  let ok = 0, failed = 0;
  for (const p of products) {
    try {
      const category_ids = (p.categories ?? [])
        .map((c: any) => catByHandle.get(c.handle))
        .filter(Boolean);

      const input: any = {
        title: p.title,
        subtitle: p.subtitle ?? undefined,
        description: p.description ?? undefined,
        handle: p.handle,
        status: p.status === "published" ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
        discountable: p.discountable,
        is_giftcard: p.is_giftcard,
        weight: p.weight ? Number(p.weight) : undefined,
        length: p.length ? Number(p.length) : undefined,
        height: p.height ? Number(p.height) : undefined,
        width: p.width ? Number(p.width) : undefined,
        hs_code: p.hs_code || undefined,
        mid_code: p.mid_code || undefined,
        material: p.material || undefined,
        origin_country: p.origin_country || undefined,
        thumbnail: rewriteUrl(p.thumbnail),
        metadata: p.metadata ?? undefined,
        category_ids: category_ids.length ? category_ids : undefined,
        shipping_profile_id: shippingProfileId,
        sales_channels: [{ id: salesChannelId }],
        images: (p.images ?? []).map((img: any) => ({ url: rewriteUrl(img.url) })),
        options: (p.options ?? []).map((o: any) => ({
          title: o.title,
          values: (o.values ?? []).map((v: any) => v.value),
        })),
        variants: (p.variants ?? []).map((v: any) => ({
          title: v.title,
          sku: v.sku ?? undefined,
          barcode: v.barcode ?? undefined,
          manage_inventory: v.manage_inventory ?? false,
          allow_backorder: v.allow_backorder ?? false,
          weight: v.weight ? Number(v.weight) : undefined,
          metadata: v.metadata ?? undefined,
          options: Object.fromEntries((v.options ?? []).map((o: any) => [o.option.title, o.value])),
          prices: dedupePrices(v.prices),
        })),
      };

      const { result: createdProducts } = await createProductsWorkflow(container).run({
        input: { products: [input] },
      });
      const created = createdProducts[0];

      // option_keys umschlüsseln: alte Option-IDs -> neue (über den Titel verbunden)
      const oldOptionKeys = p.metadata?.option_keys;
      if (oldOptionKeys && created?.options?.length) {
        const oldIdToTitle = new Map<string, string>((p.options ?? []).map((o: any) => [o.id, o.title]));
        const newTitleToId = new Map<string, string>(created.options.map((o: any) => [o.title, o.id]));
        const newOptionKeys: Record<string, string> = {};
        for (const [oldId, name] of Object.entries(oldOptionKeys)) {
          const title = oldIdToTitle.get(oldId);
          const newId = title ? newTitleToId.get(title) : undefined;
          if (newId) newOptionKeys[newId] = name as string;
        }
        await productModule.updateProducts(created.id, {
          metadata: { ...(p.metadata ?? {}), option_keys: newOptionKeys },
        });
      }

      ok++;
      logger.info(`[import] ✓ ${p.title} (${p.handle})`);
    } catch (e: any) {
      failed++;
      logger.error(`[import] ✗ ${p.title} (${p.handle}): ${e?.message ?? e}`);
    }
  }

  logger.info(`[import] Fertig: ${ok} erfolgreich, ${failed} fehlgeschlagen.`);
}
