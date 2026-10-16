import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { resolve } from "path";

import { toHandle } from "./import-colop-stamps";

/** Eine Zeile aus katalog-import/trodat-kissen.csv */
type TrodatPad = {
  name: string;
  type: string;
  fitsStamps: string[];
};

const PAD_CATEGORY = { name: "Trodat Kissen", handle: "trodat-kissen" };
const CATALOG_SOURCE = "Trodat-Stempelkatalog 2020 (PDF), Übersicht trodatkissen";

/** Farben der einfarbigen Kissen – dieselben Schlüssel wie bei COLOP, damit der Shop sie übersetzt. */
const COLORS = [
  { key: "black", label: "schwarz" },
  { key: "blue", label: "blau" },
  { key: "green", label: "grün" },
  { key: "red", label: "rot" },
  { key: "violet", label: "violett" },
  { key: "uninked", label: "ungefärbt" },
];

/**
 * Legt die Trodat-Ersatzkissen aus katalog-import/trodat-kissen.csv an.
 *
 * Je Kissen ein Produkt. Einfarbige Kissen bekommen die Auswahl "Kissenfarbe"
 * (technischer Name cushion_color – damit übersetzt der Shop die Farben),
 * zweifarbige und Textilkissen eine einzige Variante "Standard".
 * Status Entwurf, ohne Preise, ohne Bild, nicht im Designer gestaltbar.
 *
 * Übersprungen: uebernehmen = "nein". Gibt es ein Produkt schon (gleicher
 * handle), wird es übersprungen.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/import-trodat-pads.ts ../katalog-import/trodat-kissen.csv probelauf
 *   npx medusa exec ./src/scripts/import-trodat-pads.ts ../katalog-import/trodat-kissen.csv
 */
export default async function importTrodatPads({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const dryRun = (args ?? []).includes("probelauf");
  const file = resolve((args ?? []).find((a) => a !== "probelauf") ?? "../katalog-import/trodat-kissen.csv");
  logger.info(`[trodat-kissen] lese ${file}${dryRun ? " – PROBELAUF, es wird nichts angelegt" : ""}`);

  // Das unsichtbare BOM am Anfang entfernen (steht drin, damit Excel Umlaute richtig zeigt).
  const text = (await fs.readFile(file, "utf-8")).replace(/^\uFEFF/, "");
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());

  const columns = header.split(";").map((c) => c.trim());
  const column = (name: string) => {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error(`Spalte "${name}" fehlt in ${file}`);
    return index;
  };
  const col = {
    name: column("kissen"),
    type: column("art"),
    fits: column("passend_fuer"),
    take: column("uebernehmen"),
  };

  const pads: TrodatPad[] = [];
  for (const line of lines) 
  {
    const cells = line.split(";").map((c) => c.trim());
    if (!cells[col.name]) continue;
    if ((cells[col.take] ?? "").toLowerCase() === "nein") continue;
    pads.push({
      name: cells[col.name],
      type: cells[col.type] || "einfarbig",
      fitsStamps: (cells[col.fits] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
  }

  // "6/4911 C" -> trodat-6-4911-c
  const handleOf = (pad: TrodatPad) => `trodat-${toHandle(pad.name)}`;
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
      const variantCount = pad.type === "einfarbig" ? COLORS.length : 1;
      logger.info(`[trodat-kissen] ${state.padEnd(13)} Trodat Ersatzkissen ${pad.name} (${pad.type}) – ${variantCount} Variante(n)`);
    }
    logger.info(`[trodat-kissen] Probelauf fertig: ${pads.length} Kissen.`);
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
    logger.info(`[trodat-kissen] Kategorie "${PAD_CATEGORY.name}" angelegt.`);
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
      // Einfarbig: Auswahl Kissenfarbe. Sonst eine einzige Variante.
      // Einfarbig: alle Farben. Textilkissen (6/4911 C): laut Katalog nur Schwarz.
      const padColors =
        pad.type === "einfarbig" ? COLORS
        : pad.type === "textil" ? COLORS.filter((color) => color.key === "black")
        : [];
      const colored = padColors.length > 0;
      const optionTitle = colored ? "Kissenfarbe" : "Ausführung";
      const skuBase = `TRODAT-${toHandle(pad.name).toUpperCase()}`;
      const variants = colored
        ? padColors.map((color) => ({
            title: color.label,
            sku: `${skuBase}-${color.key}`,
            manage_inventory: false,
            options: { [optionTitle]: color.key },
            metadata: { trodat_pad: pad.name, color: color.key },
          }))
        : [{
            title: "Standard",
            sku: skuBase,
            manage_inventory: false,
            options: { [optionTitle]: "Standard" },
            metadata: { trodat_pad: pad.name },
          }];

      const metadata = {
        manufacturer: "Trodat",
        catalog_source: CATALOG_SOURCE,
        trodat_pad: pad.name,
        pad_type: pad.type,
        fits_stamps: pad.fitsStamps,
      };

      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [{
            title: `Trodat Ersatzkissen ${pad.name}`,
            handle,
            status: ProductStatus.DRAFT,
            description: pad.fitsStamps.length > 0 ? `Passend für Trodat ${pad.fitsStamps.join(", ")}` : undefined,
            shipping_profile_id: shippingProfileId,
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryId],
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
      logger.info(`[trodat-kissen] ✓ Trodat Ersatzkissen ${pad.name} (${variants.length} Variante(n))`);
    } catch (e: any) {
      failed++;
      logger.error(`[trodat-kissen] ✗ Trodat Ersatzkissen ${pad.name}: ${e?.message ?? e}`);
    }
  }

  logger.info(`[trodat-kissen] Fertig: ${created} angelegt, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
}
