import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { resolve } from "path";

import { download, imageType } from "./import-colop-images";
import { toHandle } from "./import-colop-stamps";

/** Ein Kissen aus katalog-import/colop-kissen.json */
type CatalogPad = {
  manufacturer: string;
  name: string;
  type: string;
  sku: string | null;
  colors: { key: string; label: string }[];
  fits_text: string;
  fits_stamps: string[];
  size_text: string;
  image_url: string | null;
  source_url: string;
  retrieved: string;
};

const PAD_CATEGORY = { name: "COLOP Kissen", handle: "colop-kissen" };

/** Art des Kissens – am Namen erkennbar ("/2" allein reicht nicht: E/20, E/200 …). */
const padType = (pad: CatalogPad) =>
  pad.name.includes("blau-rot") ? "zweifarbig" : pad.name.includes("Stamp Pad") ? "stempelkissen" : "ersatzkissen";

/**
 * Legt die Stempelkissen aus dem COLOP-Katalog in Medusa an.
 *
 * Je Kissen ein Produkt. Einfarbige Kissen bekommen die Auswahl "Kissenfarbe"
 * (technischer Name cushion_color – damit übersetzt der Shop die Farben),
 * zweifarbige und Stempelkissen eine einzige Variante "Standard".
 * Das Bild wird gleich mit heruntergeladen. Status Entwurf, ohne Preise,
 * nicht im Designer gestaltbar.
 *
 * Gibt es ein Produkt schon (gleicher handle), wird es übersprungen.
 *
 * Aufruf (im Ordner medusa-backend; braucht kein GPE):
 *   npx medusa exec ./src/scripts/import-colop-pads.ts ../katalog-import/colop-kissen.json probelauf
 *   npx medusa exec ./src/scripts/import-colop-pads.ts ../katalog-import/colop-kissen.json
 */
export default async function importColopPads({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fileModule = container.resolve(Modules.FILE);

  const dryRun = (args ?? []).includes("probelauf");
  const file = resolve((args ?? []).find((a) => a !== "probelauf") ?? "../katalog-import/colop-kissen.json");
  logger.info(`[colop-kissen] lese ${file}${dryRun ? " – PROBELAUF, es wird nichts angelegt" : ""}`);

  const pads: CatalogPad[] = JSON.parse(await fs.readFile(file, "utf-8")).filter((p: CatalogPad) => p.sku);

  const handleOf = (pad: CatalogPad) => `colop-${toHandle(pad.name)}`;
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: pads.map(handleOf) },
  });
  const existingHandles = new Set(existing.map((p: any) => p.handle));

  if (dryRun) 
  {
    for (const pad of pads) 
    {
      const state = existingHandles.has(handleOf(pad)) ? "gibt es schon" : "NEU";
      const variantCount = pad.colors.length > 1 ? pad.colors.length : 1;
      logger.info(`[colop-kissen] ${state.padEnd(13)} COLOP ${pad.name} (${padType(pad)}) – ${variantCount} Variante(n)`);
    }
    logger.info(`[colop-kissen] Probelauf fertig: ${pads.length} Kissen.`);
    return;
  }

  // Vertriebskanal, Versandprofil, Kategorie – wie bei den Stempeln.
  const { data: [store] } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] });
  const salesChannelId = store?.default_sales_channel_id;
  if (!salesChannelId) throw new Error("Kein Default Sales Channel gefunden.");

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] });
  const shippingProfileId = profiles.find((p: any) => p.type === "default")?.id ?? profiles[0]?.id;
  if (!shippingProfileId) throw new Error("Kein Shipping Profile gefunden.");

  const { data: [existingCategory] } = await query.graph({
    entity: "product_category",
    fields: ["id"],
    filters: { handle: PAD_CATEGORY.handle },
  });
  let categoryId = existingCategory?.id;
  if (!categoryId) 
  {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: [{ ...PAD_CATEGORY, is_active: true }] },
    });
    categoryId = result[0].id;
    logger.info(`[colop-kissen] Kategorie "${PAD_CATEGORY.name}" angelegt.`);
  }

  let created = 0, skipped = 0, failed = 0;

  for (const pad of pads) 
  {
    const handle = handleOf(pad);
    if (existingHandles.has(handle)) 
    {
      skipped++;
      continue;
    }

    try {
      // Bild holen und im Datei-Modul ablegen – ohne Bild geht es trotzdem weiter.
      let imageUrl: string | undefined;
      if (pad.image_url) 
      {
        try {
          const bytes = await download(pad.image_url);
          const fileType = imageType(bytes);
          if (fileType) 
          {
            const [uploaded] = await fileModule.createFiles([{
              filename: `colop-${pad.sku}.${fileType.ext}`,
              mimeType: fileType.mimeType,
              content: bytes.toString("base64"),
              access: "public",
            }]);
            imageUrl = uploaded.url;
          }
        } catch (e: any) {
          logger.warn(`[colop-kissen] ${pad.name}: Bild nicht geladen (${e?.message ?? e})`);
        }
      }

      // Einfarbig: Auswahl Kissenfarbe. Sonst eine einzige Variante.
      const colored = pad.colors.length > 1;
      const optionTitle = colored ? "Kissenfarbe" : "Ausführung";
      const variants = colored
        ? pad.colors.map((color) => ({
            title: color.label,
            sku: `COLOP-${pad.sku}-${color.key}`,
            manage_inventory: false,
            options: { [optionTitle]: color.key },
            metadata: { colop_sku: pad.sku, color: color.key },
          }))
        : [{
            title: "Standard",
            sku: `COLOP-${pad.sku}`,
            manage_inventory: false,
            options: { [optionTitle]: "Standard" },
            metadata: { colop_sku: pad.sku },
          }];

      const metadata = {
        manufacturer: "COLOP",
        catalog_source: "colop.com",
        colop_sku: pad.sku,
        pad_type: padType(pad),
        fits_stamps: pad.fits_stamps,
        size_text: pad.size_text,
        source_url: pad.source_url,
        retrieved: pad.retrieved,
      };

      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [{
            title: `COLOP ${pad.name}`,
            handle,
            status: ProductStatus.DRAFT,
            description: pad.fits_text || undefined,
            shipping_profile_id: shippingProfileId,
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryId],
            ...(imageUrl ? { thumbnail: imageUrl, images: [{ url: imageUrl }] } : {}),
            metadata,
            options: [{ title: optionTitle, values: variants.map((v) => v.options[optionTitle]) }],
            variants,
          }],
        },
      });

      // Technischer Name der Option: cushion_color – daran erkennt der Shop
      // eine Farbe und übersetzt "black" in "Schwarz" usw.
      if (colored) 
      {
        const option = result[0]?.options?.find((o: any) => o.title === optionTitle);
        if (option) 
        {
          await updateProductsWorkflow(container).run({
            input: {
              products: [{ id: result[0].id, metadata: { ...metadata, option_keys: { [option.id]: "cushion_color" } } }],
            },
          });
        }
      }

      created++;
      logger.info(`[colop-kissen] ✓ COLOP ${pad.name} (${variants.length} Variante(n)${imageUrl ? ", mit Bild" : ""})`);
    } catch (e: any) {
      failed++;
      logger.error(`[colop-kissen] ✗ COLOP ${pad.name}: ${e?.message ?? e}`);
    }
  }

  logger.info(`[colop-kissen] Fertig: ${created} angelegt, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
}
