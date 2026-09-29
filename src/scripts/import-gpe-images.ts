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
function bildTyp(bytes: Buffer): { ext: string; mimeType: string } | null {
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
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/import-gpe-images.ts 5     (nur 5 Produkte, zum Testen)
 *   npx medusa exec ./src/scripts/import-gpe-images.ts       (alle offenen)
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
  const alle: any[] = [];
  const take = 500;
  let skip = 0;
  while (true) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "thumbnail", "metadata"],
      pagination: { skip, take },
    });
    alle.push(...data);
    if (data.length < take) break;
    skip += take;
  }

  const kandidaten = alle
    .filter((p: any) => p.metadata?.gpe_id && !p.thumbnail)
    .slice(0, maximum);

  logger.info(`[bilder] ${alle.length} Produkt(e) in Medusa, ${kandidaten.length} ohne Bild mit GPE-Kennung`);

  const updates: any[] = [];
  let ohneBild = 0;
  let fehler = 0;

  for (const produkt of kandidaten) {
    const gpeId = String(produkt.metadata.gpe_id);
    try {
      const bytes = await erp.downloadProductFile(gpeId, "image");
      if (!bytes) {
        ohneBild++;
        continue;
      }
      const typ = bildTyp(bytes);
      if (!typ) {
        logger.warn(`[bilder] ${produkt.title}: unbekanntes Dateiformat (${bytes.length} Bytes), übersprungen`);
        fehler++;
        continue;
      }

      // Dateiname aus der GPE-Kennung, nicht aus der Artikelnummer: Die kann
      // Sterne, Leerzeichen und Anführungszeichen enthalten (*** 100004577).
      const [datei] = await fileModule.createFiles([{
        filename: `gpe-${gpeId}.${typ.ext}`,
        mimeType: typ.mimeType,
        content: bytes.toString("base64"),
        access: "public",
      }]);

      updates.push({ id: produkt.id, thumbnail: datei.url, images: [{ url: datei.url }] });
      logger.info(`[bilder] ${produkt.title} → ${datei.url} (${bytes.length} Bytes)`);
    } catch (e: any) {
      fehler++;
      logger.error(`[bilder] ${produkt.title}: ${e?.message ?? e}`);
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
    `${ohneBild} Produkt(e) ohne Bild in GPE, ${fehler} Fehler`
  );
}
