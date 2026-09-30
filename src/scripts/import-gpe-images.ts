import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { ERP_MODULE } from "../modules/erp";
import type ErpModuleService from "../modules/erp/service";

/**
 * Bildtyp an den Kennbytes am Dateianfang erkennen.
 *
 * Nötig, weil GPE als Content-Type immer application/octet-stream meldet und
 * der Dateiname nicht mitkommt. Medusas Datei-Modul braucht aber einen echten
 * mimeType, sonst liefert der Browser das Bild später nicht als Bild aus.
 */
function imageType(bytes: Buffer): { ext: string; mimeType: string } | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", mimeType: "image/jpeg" };
  }
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
      bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: "png", mimeType: "image/png" };
  }
  return null;
}

/**
 * Holt die Produktbilder aus GPE und hängt sie an die Medusa-Produkte.
 *
 * Betroffen sind Produkte mit metadata.gpe_id, die noch kein thumbnail haben –
 * das Skript ist damit beliebig oft wiederholbar und macht nur die Arbeit, die
 * noch offen ist.
 *
 * Aufruf (im Ordner medusa-backend) – der Umweg über npm ist nötig, weil GPE eine
 * interne Zertifizierungsstelle benutzt, die Node nur über NODE_EXTRA_CA_CERTS lädt.
 * Ein nacktes "medusa exec" scheitert mit "fetch failed":
 *   npm run images:gpe -- 5     (nur 5 Produkte, zum Testen)
 *   npm run images:gpe          (alle offenen)
 */

export default async function importGpeImages(
  { container, args }: { container: any; args: string[] }
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fileModule = container.resolve(Modules.FILE);
  const erp: ErpModuleService = container.resolve(ERP_MODULE);

  const maximum = args?.[0] ? Number(args[0]) : Number.POSITIVE_INFINITY;

  // Seitenweise lesen – ohne Begrenzung liefert query.graph nur die erste Seite
  const allProducts: any[] = [];
  const take = 500;
  let skip = 0;
  while (true) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "thumbnail", "metadata"],
      pagination: { skip, take },
    });
    allProducts.push(...data);
    if (data.length < take) break;
    skip += take;
  }

  const candidates = allProducts
    .filter((p: any) => p.metadata?.gpe_id && !p.thumbnail)
    .slice(0, maximum);

  logger.info(`[bilder] ${allProducts.length} Produkt(e) in Medusa, ${candidates.length} ohne Bild mit GPE-Kennung`);

  const updates: any[] = [];
  let withoutImageCount = 0;
  let failedCount = 0;

  for (const product of candidates) {
    const gpeId = String(product.metadata.gpe_id);
    try {
      const bytes = await erp.downloadProductFile(gpeId, "image");
      if (!bytes) {
        withoutImageCount++;
        continue;
      }
      const fileType = imageType(bytes);
      if (!fileType) {
        logger.warn(`[bilder] ${product.title}: unbekanntes Dateiformat (${bytes.length} Bytes), übersprungen`);
        failedCount++;
        continue;
      }

      // Dateiname aus der GPE-Kennung, nicht aus der Artikelnummer: Die kann
      // Sterne, Leerzeichen und Anführungszeichen enthalten (*** 100004577).
      const [uploadedFile] = await fileModule.createFiles([{
        filename: `gpe-${gpeId}.${fileType.ext}`,
        mimeType: fileType.mimeType,
        content: bytes.toString("base64"),
        access: "public",
      }]);

      updates.push({ id: product.id, thumbnail: uploadedFile.url, images: [{ url: uploadedFile.url }] });
      logger.info(`[bilder] ${product.title} → ${uploadedFile.url} (${bytes.length} Bytes)`);
    } catch (e: any) {
      failedCount++;
      logger.error(`[bilder] ${product.title}: ${e?.message ?? e}`);
    }
  }

  // In Blöcken speichern statt einmal je Produkt – ein Workflow-Aufruf pro
  // Produkt wäre bei tausenden Produkten unnötig langsam.
  for (let start = 0; start < updates.length; start += 50) {
    await updateProductsWorkflow(container).run({
      input: { products: updates.slice(start, start + 50) },
    });
  }

  logger.info(
    `[bilder] fertig: ${updates.length} Bild(er) gesetzt, ` +
    `${withoutImageCount} Produkt(e) ohne Bild in GPE, ${failedCount} Fehler`
  );
}
