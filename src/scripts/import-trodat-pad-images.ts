import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { join, resolve } from "path";

import { imageType } from "./import-colop-images";

const IMAGE_FOLDER = "../katalog-import/trodat-bilder";

/** Kissen-Art (metadata.pad_type) -> Bilddatei; Textil ohne eigenes Bild nimmt das einfarbige. */
const IMAGE_BY_TYPE: Record<string, string> = {
  einfarbig: "ersatzkissen-einfarbig.png",
  zweifarbig: "ersatzkissen-zweifarbig.png",
  textil: "ersatzkissen-textil.png",
};

/**
 * Hängt an die Trodat-Ersatzkissen ein Platzhalterbild – je nach Art des
 * Kissens (einfarbig, zweifarbig, textil). Jede Datei wird nur einmal
 * hochgeladen; alle Kissen derselben Art nutzen dieselbe Adresse.
 *
 * Kissen mit Vorschaubild werden übersprungen – beliebig oft wiederholbar.
 * Für echte Fotos später: Bild im Admin ersetzen oder Vorschaubild löschen,
 * Datei austauschen und das Skript erneut starten.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/import-trodat-pad-images.ts
 */
export default async function importTrodatPadImages({ container }: { container: any }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fileModule = container.resolve(Modules.FILE);

  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: ["id", "title", "thumbnail", "metadata", "images.id", "images.url"],
  });
  // Nur Trodat-Kissen ohne Vorschaubild (die Stempel haben kein pad_type).
  const pads = allProducts.filter(
    (p: any) => p.metadata?.manufacturer === "Trodat" && p.metadata?.pad_type && !p.thumbnail
  );

  // Jede Bilddatei höchstens einmal hochladen: Dateiname -> Adresse
  const urlByFile = new Map<string, string>();
  const uploadOnce = async (fileName: string) => {
    const known = urlByFile.get(fileName);
    if (known) return known;

    const bytes = await fs.readFile(join(resolve(IMAGE_FOLDER), fileName));
    const fileType = imageType(bytes);
    if (!fileType) throw new Error(`${fileName}: unbekanntes Dateiformat`);

    const [file] = await fileModule.createFiles([{
      filename: `trodat-${fileName}`,
      mimeType: fileType.mimeType,
      content: bytes.toString("base64"),
      access: "public",
    }]);
    urlByFile.set(fileName, file.url);
    return file.url;
  };

  let done = 0, failed = 0;

  for (const pad of pads) 
  {
    const fileName = IMAGE_BY_TYPE[pad.metadata.pad_type] ?? IMAGE_BY_TYPE.einfarbig;
    try {
      const url = await uploadOnce(fileName);
      // Vorhandene Bilder MIT id mitgeben, damit sie erhalten bleiben.
      const existingImages = (pad.images ?? []).map((img: any) => ({ id: img.id, url: img.url }));
      await updateProductsWorkflow(container).run({
        input: {
          products: [{ id: pad.id, images: [...existingImages, { url }], thumbnail: url }],
        },
      });
      done++;
    } catch (e: any) {
      failed++;
      logger.error(`[trodat-kissenbilder] ${pad.title}: ${e?.message ?? e}`);
    }
  }

  logger.info(
    `[trodat-kissenbilder] fertig: ${done} Kissen mit Bild, ${failed} Fehler ` +
    `(${urlByFile.size} Datei(en) hochgeladen).`
  );
}
