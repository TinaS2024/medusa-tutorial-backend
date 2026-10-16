import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  batchVariantImagesWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { join, resolve } from "path";

import { imageType } from "./import-colop-images";

const IMAGE_FOLDER = "../katalog-import/trodat-bilder";
const MAPPING_FILE = "../katalog-import/trodat-bilder-zuordnung.csv";

/**
 * Lädt die selbst zugeschnittenen Trodat-Bilder aus katalog-import/trodat-bilder
 * ins Medusa-Datei-Modul und setzt sie als Vorschaubild der Varianten – so
 * wechselt das Bild im Shop mit dem gewählten Modell.
 *
 * Welches Bild zu welchem Modell gehört, steht in trodat-bilder-zuordnung.csv
 * (Spalten modell und bild). Gilt ein Bild für mehrere Modelle, wird es je
 * Produkt nur einmal hochgeladen und allen diesen Varianten zugeordnet.
 *
 * Varianten mit Vorschaubild werden übersprungen – beliebig oft wiederholbar.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/import-trodat-images.ts probelauf
 *   npx medusa exec ./src/scripts/import-trodat-images.ts
 */
export default async function importTrodatImages({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fileModule = container.resolve(Modules.FILE);

  const dryRun = (args ?? []).includes("probelauf");
  if (dryRun) logger.info("[trodat-bilder] PROBELAUF – es wird nichts hochgeladen");

  // 1. Zuordnung Modell -> Bilddatei einlesen (BOM entfernen, wie beim Stempel-Import).
  const text = (await fs.readFile(resolve(MAPPING_FILE), "utf-8")).replace(/^\uFEFF/, "");
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  const columns = header.split(";").map((c) => c.trim());
  const modelColumn = columns.indexOf("modell");
  const imageColumn = columns.indexOf("bild");
  if (modelColumn < 0 || imageColumn < 0) 
  {
    throw new Error(`Spalte "modell" oder "bild" fehlt in ${MAPPING_FILE}`);
  }

  const imageByModel = new Map<string, string>();
  for (const line of lines) 
  {
    const cells = line.split(";").map((c) => c.trim());
    if (cells[modelColumn] && cells[imageColumn]) imageByModel.set(cells[modelColumn], cells[imageColumn]);
  }

  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "thumbnail", "metadata",
      "images.id", "images.url",
      "variants.id", "variants.title", "variants.thumbnail", "variants.metadata",
    ],
  });
  const products = allProducts.filter((p: any) => p.metadata?.manufacturer === "Trodat");

  let done = 0, failed = 0, withoutImage = 0;

  for (const product of products) 
  {
    // 2. Offene Varianten nach Bilddatei sammeln: eine Datei -> eine oder mehrere Varianten.
    const variantsByFile = new Map<string, string[]>();
    for (const variant of product.variants ?? []) 
    {
      if (variant.thumbnail) continue;
      const fileName = imageByModel.get(variant.metadata?.trodat_model);
      if (!fileName) 
      {
        withoutImage++;
        logger.warn(`[trodat-bilder] ${product.title} – ${variant.title}: kein Bild in der Zuordnung`);
        continue;
      }
      const list = variantsByFile.get(fileName) ?? [];
      list.push(variant.id);
      variantsByFile.set(fileName, list);
    }
    if (variantsByFile.size === 0) continue;

    // 3. Jede Datei einmal lesen und hochladen (im Probelauf nur lesen).
    const urlByFile = new Map<string, string>();
    for (const fileName of variantsByFile.keys()) 
    {
      try {
        const bytes = await fs.readFile(join(resolve(IMAGE_FOLDER), fileName));
        const fileType = imageType(bytes);
        if (!fileType) throw new Error(`unbekanntes Dateiformat (${bytes.length} Bytes)`);
        if (dryRun) continue;

        const [file] = await fileModule.createFiles([{
          filename: `trodat-${fileName}`,
          mimeType: fileType.mimeType,
          content: bytes.toString("base64"),
          access: "public",
        }]);
        urlByFile.set(fileName, file.url);
      } catch (e: any) {
        failed++;
        logger.error(`[trodat-bilder] ${product.title} – ${fileName}: ${e?.message ?? e}`);
      }
    }

    if (dryRun) 
    {
      const count = [...variantsByFile.values()].reduce((sum, list) => sum + list.length, 0);
      logger.info(`[trodat-bilder] ${product.title}: ${variantsByFile.size} Bild(er) für ${count} Variante(n)`);
      continue;
    }
    if (urlByFile.size === 0) continue;

    // 4. Bilder ans Produkt hängen. Die vorhandenen MIT id mitgeben, damit
    //    sie erhalten bleiben und ihre Zuordnung zu Varianten nicht verlieren.
    const existingImages = (product.images ?? []).map((img: any) => ({ id: img.id, url: img.url }));
    const newUrls = [...urlByFile.values()];
    await updateProductsWorkflow(container).run({
      input: {
        products: [{
          id: product.id,
          images: [...existingImages, ...newUrls.map((url) => ({ url }))],
          // Vorschaubild des Produkts (für die Übersicht) – nur, wenn es noch keins gibt.
          ...(product.thumbnail ? {} : { thumbnail: newUrls[0] }),
        }],
      },
    });

    // 5. Die neuen Bild-ids nachlesen – zum Zuordnen braucht Medusa die id, nicht die Adresse.
    const { data: [fresh] } = await query.graph({
      entity: "product",
      fields: ["id", "images.id", "images.url"],
      filters: { id: product.id },
    });
    const imageIdByUrl = new Map<string, string>((fresh?.images ?? []).map((img: any) => [img.url, img.id]));

    // 6. Jeder Variante ihr Bild zuordnen und als Vorschaubild setzen.
    const thumbnails: { id: string; thumbnail: string }[] = [];
    for (const [fileName, variantIds] of variantsByFile) 
    {
      const url = urlByFile.get(fileName);
      if (!url) continue; // Hochladen ist oben schon fehlgeschlagen.
      const imageId = imageIdByUrl.get(url);
      if (!imageId) 
      {
        failed++;
        logger.error(`[trodat-bilder] ${product.title}: Bild ${fileName} nach dem Speichern nicht gefunden.`);
        continue;
      }
      for (const variantId of variantIds) 
      {
        await batchVariantImagesWorkflow(container).run({
          input: { variant_id: variantId, add: [imageId] },
        });
        thumbnails.push({ id: variantId, thumbnail: url });
        done++;
      }
    }

    if (thumbnails.length > 0) 
    {
      await updateProductVariantsWorkflow(container).run({
        input: { product_variants: thumbnails },
      });
    }
    logger.info(`[trodat-bilder] ✓ ${product.title}: ${urlByFile.size} Bild(er), ${thumbnails.length} Variante(n)`);
  }

  logger.info(
    `[trodat-bilder] fertig: ${done} Variante(n) mit Bild, ${failed} Fehler, ` +
    `${withoutImage} Variante(n) ohne Bild in der Zuordnung.`
  );
}
