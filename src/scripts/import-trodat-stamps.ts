import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { resolve } from "path";

import { toHandle } from "./import-colop-stamps";

/** Eine Zeile aus katalog-import/trodat-modelle.csv */
type TrodatModel = {
  model: string;
  series: string;
  page: string;
  width: number;
  height: number;
  shape: "rect" | "round" | "oval";
  pad: string;
  designerCategory: string;
};

const MANUFACTURER_CATEGORY = { name: "Trodat", handle: "trodat" };
const CATALOG_SOURCE = "Trodat-Stempelkatalog 2020 (PDF)";

/** "47,5" oder "47.5" -> 47.5; leer oder unlesbar -> null */
const toNumber = (text: string | undefined) => {
  const value = Number(String(text ?? "").replace(",", ".").trim());
  return Number.isFinite(value) && value > 0 ? value : null;
};


/** Form aus der Tabelle -> Form im Designer ("rect", "round" oder "oval"); Unbekanntes wird zum Rechteck. */
const toShape = (text: string | undefined): TrodatModel["shape"] => {
  if (text === "circle") return "round";
  if (text === "ellipse") return "oval";
  return "rect";
};


/**
 * Legt die Trodat-Stempel aus der geprüften Tabelle trodat-modelle.csv an
 * (von Hand geprüft nach katalog-import/Trodat-Liste.txt).
 *
 * Je Produktreihe ein Produkt (Printy, Professional …), die Modelle als
 * Auswahl "Sorte". Die Textplattengröße steht an der Variante in Breite und
 * Höhe – dort lesen Shop und Designer sie. Status Entwurf, ohne Preise.
 *
 * Übersprungen: uebernehmen = "nein" und Zeilen ohne Größe.
 * Gibt es ein Produkt schon (gleicher handle), wird es übersprungen.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/import-trodat-stamps.ts ../katalog-import/trodat-modelle.csv probelauf
 *   npx medusa exec ./src/scripts/import-trodat-stamps.ts ../katalog-import/trodat-modelle.csv
 */
export default async function importTrodatStamps({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const dryRun = (args ?? []).includes("probelauf");
  const file = resolve((args ?? []).find((a) => a !== "probelauf") ?? "../katalog-import/trodat-modelle.csv");
  logger.info(`[trodat] lese ${file}${dryRun ? " – PROBELAUF, es wird nichts angelegt" : ""}`);

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
    model: column("modell"),
    series: column("reihe"),
    page: column("seite"),
    width: column("breite_mm"),
    height: column("hoehe_mm"),
    shape: column("form"),
    pad: column("kissen"),
    designer: column("designer"),
    take: column("uebernehmen"),
  };

  const models: TrodatModel[] = [];
  const withoutSize: string[] = [];

  for (const line of lines) 
  {
    const cells = line.split(";").map((c) => c.trim());
    const model = cells[col.model];
    if (!model) continue;
    if ((cells[col.take] ?? "").toLowerCase() === "nein") continue;

    const width = toNumber(cells[col.width]);
    const height = toNumber(cells[col.height]);
    if (!width || !height) 
    {
      withoutSize.push(model);
      continue;
    }

    models.push({
      model,
      series: cells[col.series] || "Sonstige",
      page: cells[col.page] ?? "",
      width,
      height,
      shape: toShape(cells[col.shape]),
      pad: cells[col.pad] ?? "",
      // Leer = normaler Stempel; "emboss" bei Prägestempeln.
      designerCategory: cells[col.designer] || "self_inking",
    });
  }

  if (withoutSize.length > 0) 
  {
    logger.warn(`[trodat] ${withoutSize.length} Modell(e) ohne Größe übersprungen: ${withoutSize.join(", ")}`);
  }

  // Je Produktreihe ein Produkt.
  const bySeries = new Map<string, TrodatModel[]>();
  for (const model of models) 
  {
    const list = bySeries.get(model.series) ?? [];
    list.push(model);
    bySeries.set(model.series, list);
  }

  const handleOf = (series: string) => `trodat-${toHandle(series)}`;
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: [...bySeries.keys()].map(handleOf) },
  });
  const existingHandles = new Set(existing.map((p: any) => p.handle));

  if (dryRun) 
  {
    for (const [series, list] of bySeries) 
    {
      const state = existingHandles.has(handleOf(series)) ? "gibt es schon" : "NEU";
      logger.info(`[trodat] ${state.padEnd(13)} Trodat ${series} (${handleOf(series)}) – ${list.length} Modell(e)`);
    }
    logger.info(`[trodat] Probelauf fertig: ${bySeries.size} Produkte, ${models.length} Modelle.`);
    return;
  }

  // Vertriebskanal, Versandprofil und Kategorie – wie bei COLOP.
  const { data: [store] } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] });
  const salesChannelId = store?.default_sales_channel_id;
  if (!salesChannelId) throw new Error("Kein Default Sales Channel gefunden.");

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] });
  const shippingProfileId = profiles.find((p: any) => p.type === "default")?.id ?? profiles[0]?.id;
  if (!shippingProfileId) throw new Error("Kein Shipping Profile gefunden.");

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
    logger.info(`[trodat] Kategorie "${MANUFACTURER_CATEGORY.name}" angelegt.`);
  }

  let created = 0, skipped = 0, failed = 0;

  for (const [series, list] of bySeries) 
  {
    const handle = handleOf(series);
    if (existingHandles.has(handle)) 
    {
      skipped++;
      logger.info(`[trodat] – ${handle} gibt es schon, übersprungen.`);
      continue;
    }

    try {
      await createProductsWorkflow(container).run({
        input: {
          products: [{
            title: `Trodat ${series}`,
            handle,
            status: ProductStatus.DRAFT,
            material: "Gummi",
            shipping_profile_id: shippingProfileId,
            sales_channels: [{ id: salesChannelId }],
            category_ids: [categoryId],
            metadata: {
              manufacturer: "Trodat",
              catalog_source: CATALOG_SOURCE,
              is_designable: true,
              designer_category: list[0].designerCategory,
              designer_shape: list[0].shape,
            },
            options: [{ title: "Sorte", values: list.map((m) => m.model) }],
            variants: list.map((m) => ({
              title: m.model,
              // Präfix, damit die Trodat-Nummer nie mit anderen Artikelnummern kollidiert.
              // Aus "52045 (Ø 40 mm)" wird TRODAT-52045-40-MM, aus "4912" TRODAT-4912.
              sku: `TRODAT-${toHandle(m.model).toUpperCase()}`,
              manage_inventory: false,
              // Textplattengröße – hier lesen Shop und Designer sie.
              width: m.width,
              height: m.height,
              options: { Sorte: m.model },
              metadata: {
                trodat_model: m.model,
                trodat_pad: m.pad,
                designer_shape: m.shape,
                catalog_page: m.page,
              },
            })),
          }],
        },
      });
      created++;
      logger.info(`[trodat] ✓ Trodat ${series} (${list.length} Modell(e))`);
    } catch (e: any) {
      failed++;
      logger.error(`[trodat] ✗ Trodat ${series}: ${e?.message ?? e}`);
    }
  }

  logger.info(`[trodat] Fertig: ${created} angelegt, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
}
