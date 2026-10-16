import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  batchVariantImagesWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows";

const USER_AGENT = "Bolasys-Katalogimport/1.0 (+https://shop.bolasys.de)";
const PAUSE_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Bildtyp an den Kennbytes erkennen (wie in import-gpe-images.ts) –
 * zusätzlich WebP, das COLOP teils ausliefert.
 */
export function imageType(bytes: Buffer): { ext: string; mimeType: string } | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", mimeType: "image/jpeg" };
  }
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: "png", mimeType: "image/png" };
  }
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp", mimeType: "image/webp" };
  }
  return null;
}

/** Bild bei COLOP holen – mit Pause davor und einem zweiten Versuch. */
export async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 2; attempt++) 
  {
    await sleep(attempt === 1 ? PAUSE_MS : 15000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new Error("unerreichbar");
}

/**
 * Lädt die Bilder der COLOP-Stempel (aus metadata.image_url der Varianten)
 * ins Medusa-Datei-Modul und setzt sie als Vorschaubild der jeweiligen
 * Variante – so wechselt das Bild im Shop mit dem gewählten Modell.
 *
 * Varianten mit Vorschaubild werden übersprungen – beliebig oft wiederholbar.
 *
 * Aufruf (im Ordner medusa-backend; braucht kein GPE):
 *   npx medusa exec ./src/scripts/import-colop-images.ts 5     (nur 5 Varianten)
 *   npx medusa exec ./src/scripts/import-colop-images.ts       (alle offenen)
 */
export default async function importColopImages({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fileModule = container.resolve(Modules.FILE);

  const maximum = args?.[0] ? Number(args[0]) : Number.POSITIVE_INFINITY;

  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "thumbnail", "metadata",
      "images.id", "images.url",
      "variants.id", "variants.title", "variants.thumbnail", "variants.metadata",
    ],
  });

  const products = allProducts.filter((p: any) => p.metadata?.manufacturer === "COLOP");
  let remaining = maximum;
  let done = 0, failed = 0, withoutUrl = 0;

  for (const product of products) 
  {
    if (remaining <= 0) break;

    const open = (product.variants ?? []).filter((v: any) => !v.thumbnail);
    if (open.length === 0) continue;

    // 1. Bilder laden und im Datei-Modul ablegen.
    const uploaded: { variantId: string; url: string }[] = [];
    for (const variant of open) 
    {
      if (remaining <= 0) break;
      const imageUrl = variant.metadata?.image_url;
      if (!imageUrl) 
      {
        withoutUrl++;
        continue;
      }
      remaining--;

      try {
        const bytes = await download(imageUrl);
        const fileType = imageType(bytes);
        if (!fileType) throw new Error(`unbekanntes Dateiformat (${bytes.length} Bytes)`);

        const [file] = await fileModule.createFiles([{
          filename: `colop-${variant.metadata?.colop_sku ?? variant.id}.${fileType.ext}`,
          mimeType: fileType.mimeType,
          content: bytes.toString("base64"),
          access: "public",
        }]);

        uploaded.push({ variantId: variant.id, url: file.url });
        logger.info(`[colop-bilder] ${product.title} – ${variant.title}: ${Math.round(bytes.length / 1024)} KB`);
      } catch (e: any) {
        failed++;
        logger.error(`[colop-bilder] ${product.title} – ${variant.title}: ${e?.message ?? e}`);
      }
    }

    if (uploaded.length === 0) continue;

    // 2. Bilder ans Produkt hängen. Die vorhandenen MIT id mitgeben, damit
    //    sie erhalten bleiben und ihre Zuordnung zu Varianten nicht verlieren.
    const existingImages = (product.images ?? []).map((img: any) => ({ id: img.id, url: img.url }));
    await updateProductsWorkflow(container).run({
      input: {
        products: [{
          id: product.id,
          images: [...existingImages, ...uploaded.map((u) => ({ url: u.url }))],
          // Vorschaubild des Produkts (für die Übersicht) – nur, wenn es noch keins gibt.
          ...(product.thumbnail ? {} : { thumbnail: uploaded[0].url }),
        }],
      },
    });

    // 3. Die neuen Bild-ids nachlesen – zum Zuordnen braucht Medusa die id, nicht die Adresse.
    const { data: [fresh] } = await query.graph({
      entity: "product",
      fields: ["id", "images.id", "images.url"],
      filters: { id: product.id },
    });
    const imageIdByUrl = new Map<string, string>((fresh?.images ?? []).map((img: any) => [img.url, img.id]));

    // 4. Jeder Variante ihr Bild zuordnen und als Vorschaubild setzen.
    for (const { variantId, url } of uploaded) 
    {
      const imageId = imageIdByUrl.get(url);
      if (!imageId) 
      {
        failed++;
        logger.error(`[colop-bilder] ${product.title}: Bild ${url} nach dem Speichern nicht gefunden.`);
        continue;
      }
      await batchVariantImagesWorkflow(container).run({
        input: { variant_id: variantId, add: [imageId] },
      });
      done++;
    }

    await updateProductVariantsWorkflow(container).run({
      input: {
        product_variants: uploaded.map((u) => ({ id: u.variantId, thumbnail: u.url })),
      },
    });
  }

  logger.info(
    `[colop-bilder] fertig: ${done} Bild(er) gesetzt, ${failed} Fehler, ` +
    `${withoutUrl} Variante(n) ohne Bildadresse.`
  );
}
