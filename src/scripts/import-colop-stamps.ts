import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { resolve } from "path";

/** Ein Stempel aus katalog-import/colop-stempel.json */
type CatalogStamp = {
  manufacturer: string;
  name: string;
  category: string;
  width_mm: number | null;
  height_mm: number | null;
  size_text: string;
  lines: number | null;
  shape: string;
  source_url: string;
  sku: string | null;
  image_url: string | null;
  retrieved: string;
};

const MANUFACTURER_CATEGORY = { name: "COLOP", handle: "colop" };

/** "Andere Printer Formate" -> "andere-printer-formate" */
export const toHandle = (text: string) =>
  text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Form aus dem Katalog -> Form im Designer ("rect" oder "circle"). */
const toDesignerShape = (shape: string) => (shape === "round" ? "circle" : "rect");

/**
 * Legt die Stempel aus dem COLOP-Katalog in Medusa an.
 *
 * Je COLOP-Kategorie ein Produkt (wie der Trodat Printy), die Modelle als
 * Auswahl "Sorte". Die Textplattengröße steht an der Variante in Breite und
 * Höhe – dort lesen Shop (product-actions) und Designer (designer-formtypes)
 * sie. Status Entwurf, ohne Preise und ohne Kissenfarbe.
 *
 * Gibt es ein Produkt schon (gleicher handle), wird es übersprungen – ein
 * zweiter Lauf legt nichts doppelt an.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/import-colop-stamps.ts ../katalog-import/colop-stempel.json probelauf
 *   npx medusa exec ./src/scripts/import-colop-stamps.ts ../katalog-import/colop-stempel.json
 */
export default async function importColopStamps({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

// "probelauf" statt "--dry-run": medusa exec hält alles mit "--" für seine
  // eigenen Einstellungen und bricht sonst ab ("Unknown arguments").
  const dryRun = (args ?? []).includes("probelauf");
  const file = resolve((args ?? []).find((a) => a !== "probelauf") ?? "../katalog-import/colop-stempel.json");

  logger.info(`[colop] lese ${file}${dryRun ? " – PROBELAUF, es wird nichts angelegt" : ""}`);

  const stamps: CatalogStamp[] = JSON.parse(await fs.readFile(file, "utf-8"));

  // Nur vollständige Einträge – ohne Größe kann der Designer nichts anfangen.
  const usable = stamps.filter((s) => s.width_mm && s.height_mm && s.sku);
  if (usable.length < stamps.length) 
  {
    logger.warn(`[colop] ${stamps.length - usable.length} Einträge ohne Größe oder Artikelnummer übersprungen.`);
  }

  // Je Kategorie ein Produkt, die Modelle darin als "Sorte".
  const byCategory = new Map<string, CatalogStamp[]>();
  for (const stamp of usable) 
  {
    const list = byCategory.get(stamp.category) ?? [];
    list.push(stamp);
    byCategory.set(stamp.category, list);
  }

  // Schon vorhandene Produkte erkennen (über den handle).
  const handles = [...byCategory.keys()].map((category) => `colop-${toHandle(category)}`);
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: handles },
  });
  const existingHandles = new Set(existing.map((p: any) => p.handle));

  if (dryRun) 
  {
    for (const [category, models] of byCategory) 
    {
      const handle = `colop-${toHandle(category)}`;
      const state = existingHandles.has(handle) ? "gibt es schon" : "NEU";
      logger.info(`[colop] ${state.padEnd(13)} COLOP ${category} (${handle}) – ${models.length} Modell(e)`);
    }
    logger.info(`[colop] Probelauf fertig: ${byCategory.size} Produkte, ${usable.length} Modelle.`);
    return;
  }

  // Vertriebskanal und Versandprofil wie in import-products.ts
  const { data: [store] } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] });
  const salesChannelId = store?.default_sales_channel_id;
  if (!salesChannelId) throw new Error("Kein Default Sales Channel gefunden.");

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] });
  const shippingProfileId = profiles.find((p: any) => p.type === "default")?.id ?? profiles[0]?.id;
  if (!shippingProfileId) throw new Error("Kein Shipping Profile gefunden.");

  // Kategorie "COLOP" – anlegen, falls es sie noch nicht gibt.
  const { data: [existingCategory] } = await query.graph({
    entity: "product_category",
    fields: ["id"],
    filters: { handle: MANUFACTURER_CATEGORY.handle },
  });
  let categoryId = existingCategory?.id;
  if (!categoryId) 
  {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: [{ ...MANUFACTURER_CATEGORY, is_active: true }] },
    });
    categoryId = result[0].id;
    logger.info(`[colop] Kategorie "${MANUFACTURER_CATEGORY.name}" angelegt.`);
  }

  let created = 0, skipped = 0, failed = 0;

  for (const [category, models] of byCategory) 
  {
    const handle = `colop-${toHandle(category)}`;
    if (existingHandles.has(handle)) 
    {
      skipped++;
      logger.info(`[colop] – ${handle} gibt es schon, übersprungen.`);
      continue;
    }

    try {
      await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: `COLOP ${category}`,
              handle,
              status: ProductStatus.DRAFT,
              material: "Gummi",
              shipping_profile_id: shippingProfileId,
              sales_channels: [{ id: salesChannelId }],
              category_ids: [categoryId],
              metadata: {
                manufacturer: "COLOP",
                catalog_source: "colop.com",
                is_designable: true,
                designer_category: "self_inking",
                designer_shape: toDesignerShape(models[0].shape),
              },
              options: [{ title: "Sorte", values: models.map((m) => m.name) }],
              variants: models.map((m) => ({
                title: m.name,
                // Präfix, damit die COLOP-Nummer nie mit anderen Artikelnummern kollidiert.
                sku: `COLOP-${m.sku}`,
                manage_inventory: false,
                // Textplattengröße – hier lesen Shop und Designer sie.
                width: m.width_mm as number,
                height: m.height_mm as number,
                options: { Sorte: m.name },
                metadata: {
                  colop_sku: m.sku,
                  designer_shape: toDesignerShape(m.shape),
                  lines: m.lines,
                  size_text: m.size_text,
                  image_url: m.image_url,
                  source_url: m.source_url,
                  retrieved: m.retrieved,
                },
              })),
            },
          ],
        },
      });
      created++;
      logger.info(`[colop] ✓ COLOP ${category} (${models.length} Modell(e))`);
    } catch (e: any) {
      failed++;
      logger.error(`[colop] ✗ COLOP ${category}: ${e?.message ?? e}`);
    }
  }

  logger.info(`[colop] Fertig: ${created} angelegt, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
}
