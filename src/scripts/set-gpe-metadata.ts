import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { promises as fs } from "fs";
import { resolve } from "path";

type GpeMapping = {
  handle: string;
  gpe_id: string;
  gpe_name: string;
  gpe_external_id: string | null;
};

/**
 * Trägt die GPE-Kennungen als metadata an den importierten Produkten nach.
 *
 * Nötig, weil Medusas CSV-Import die Spalte "Product Metadata" stillschweigend
 * verwirft (json-2-csv wandelt die Zelle in ein Objekt, processAsJson übernimmt
 * sie aber nur als Text). Ohne metadata.gpe_name findet der wöchentliche
 * Preis-Sync (sync-gpe-products.ts) die Produkte später nicht.
 *
 * Eingabe ist die Zuordnungsdatei, die export-products.py --profile medusa
 * neben der Import-CSV ablegt.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/set-gpe-metadata.ts ../order2gpe/<zuordnung>.json
 *   GPE_MAPPING_FILE=medusa-alle-gpe-zuordnung.json npx medusa exec ./src/scripts/set-gpe-metadata.ts
 */
export default async function setGpeMetadata({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModule = container.resolve(Modules.PRODUCT);

  // Dateiname als Aufrufparameter. Ein relativer Pfad wird zum aktuellen
  // Verzeichnis aufgelöst – die Zuordnungsdatei muss also nicht erst nach
  // medusa-backend kopiert werden.
  const file = args?.[0] || "gpe-zuordnung.json";
  const pfad = resolve(file);
  logger.info(`[gpe-metadata] lese ${pfad}`);
  const raw = await fs.readFile(pfad, "utf-8");
  const mapping: GpeMapping[] = JSON.parse(raw);
  logger.info(`[gpe-metadata] ${mapping.length} Zuordnung(en) aus ${file} geladen.`);

  let updated = 0;
  let missing = 0;

  // In Blöcken abfragen statt alle Produkte auf einmal – bei über 20000
  // Produkten wäre eine einzelne Abfrage weder schnell noch zuverlässig.
  for (let start = 0; start < mapping.length; start += 200) {
    const block = mapping.slice(start, start + 200);
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "metadata"],
      filters: { handle: block.map((entry) => entry.handle) },
    });
    const byHandle = new Map(products.map((p: any) => [p.handle, p]));

    for (const entry of block) {
      const product: any = byHandle.get(entry.handle);
      if (!product) {
        missing++;
        continue;
      }
      await productModule.updateProducts(product.id, {
        metadata: {
          ...(product.metadata ?? {}),
          gpe_id: entry.gpe_id,
          gpe_name: entry.gpe_name,
          gpe_external_id: entry.gpe_external_id ?? null,
        },
      });
      updated++;
    }
    logger.info(`[gpe-metadata] ${Math.min(start + 200, mapping.length)}/${mapping.length} …`);
  }

  logger.info(
    `[gpe-metadata] fertig: ${updated} Produkt(e) gesetzt, ${missing} nicht in Medusa gefunden.`
  );
}
