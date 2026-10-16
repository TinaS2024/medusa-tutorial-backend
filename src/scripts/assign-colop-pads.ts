import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { promises as fs } from "fs";
import { resolve } from "path";

import { toHandle } from "./import-colop-stamps";

type PadLink = { handle: string; title: string };

/**
 * Schreibt die passenden Ersatzkissen an die COLOP-Stempel-Varianten
 * (metadata.compatible_pads) – aus der geprüften Tabelle
 * katalog-import/kissen-zuordnung.csv. Der Shop zeigt daraus den Link
 * "Passendes Ersatzkissen".
 *
 * Zeilen mit uebernehmen = "nein" oder leerer Kissenspalte zählen nicht.
 * Die Liste je Variante wird bei jedem Lauf komplett aus der Tabelle neu
 * gesetzt – ein zweiter Lauf mit geänderter Tabelle korrigiert also auch
 * alte Zuordnungen.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/assign-colop-pads.ts ../katalog-import/trodat-kissen-zuordnung.csv trodat
 */

export default async function assignColopPads({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  // Mit dem Wort "trodat" beim Aufruf gilt das Skript für Trodat statt COLOP.
  const brand = (args ?? []).includes("trodat") ? "trodat" : "colop";
  const file = resolve((args ?? []).find((a) => a !== "trodat") ?? "../katalog-import/kissen-zuordnung.csv");
  logger.info(`[kissen-zuordnung] lese ${file} (${brand})`);


  // Das unsichtbare BOM am Anfang entfernen (steht drin, damit Excel Umlaute richtig zeigt).
  const text = (await fs.readFile(file, "utf-8")).replace(/^\uFEFF/, "");
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());

  const columns = header.split(";").map((c) => c.trim());
  const column = (name: string) => {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error(`Spalte "${name}" fehlt in ${file}`);
    return index;
  };
  const skuColumn = column("stempel_sku");
  const padColumn = column("kissen");
  const takeColumn = column("uebernehmen");

  // Stempel-Artikelnummer -> Namen der passenden Kissen
  const padsBySku = new Map<string, Set<string>>();
  for (const line of lines) 
  {
    const cells = line.split(";").map((c) => c.trim());
    const sku = cells[skuColumn];
    if (!sku) continue;

    const pads = padsBySku.get(sku) ?? new Set<string>();
    padsBySku.set(sku, pads);

    const padName = cells[padColumn];
    const take = (cells[takeColumn] ?? "").toLowerCase();
    if (padName && take !== "nein") pads.add(padName);
  }

  // Kissen-Produkte nachschlagen – Tippfehler in der Tabelle fallen hier auf.
  const handleOf = (padName: string) => `${brand}-${toHandle(padName)}`;
  const allPadNames = [...new Set([...padsBySku.values()].flatMap((set) => [...set]))];

  const { data: padProducts } = await query.graph({
    entity: "product",
    fields: ["handle", "title"],
    filters: { handle: allPadNames.map(handleOf) },
  });
  const titleByHandle = new Map<string, string>(padProducts.map((p: any) => [p.handle, p.title]));

  for (const name of allPadNames) 
  {
    if (!titleByHandle.has(handleOf(name))) 
    {
      logger.warn(`[kissen-zuordnung] Kissen "${name}" gibt es in Medusa nicht (Tippfehler?) – übersprungen.`);
    }
  }

  // Die Stempel-Varianten (Artikelnummer COLOP-… aus dem Stempel-Import).
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "sku", "metadata"],
    filters: { sku: [...padsBySku.keys()].map((sku) => `${brand.toUpperCase()}-${sku}`) },
  });

  const updates = variants.map((variant: any) => {
    // "TRODAT-4911" -> "4911" (Vorsilbe plus Bindestrich abschneiden)
    const sku = String(variant.sku).slice(brand.length + 1);
    const links: PadLink[] = [...(padsBySku.get(sku) ?? [])]
      .filter((name) => titleByHandle.has(handleOf(name)))
      .map((name) => ({ handle: handleOf(name), title: titleByHandle.get(handleOf(name)) as string }));

    // Vorhandene Metadaten (Größe, Bildadresse …) bleiben erhalten.
    return { id: variant.id, metadata: { ...(variant.metadata ?? {}), compatible_pads: links } };
  });

  for (let start = 0; start < updates.length; start += 50) 
  {
    await updateProductVariantsWorkflow(container).run({
      input: { product_variants: updates.slice(start, start + 50) },
    });
  }

  const withPads = updates.filter((u: any) => u.metadata.compatible_pads.length > 0).length;
  logger.info(
    `[kissen-zuordnung] fertig: ${updates.length} Stempel-Varianten aktualisiert, ` +
      `${withPads} davon mit passendem Kissen.`
  );
  if (variants.length < padsBySku.size) 
  {
    logger.warn(`[kissen-zuordnung] ${padsBySku.size - variants.length} Stempel aus der Tabelle in Medusa nicht gefunden.`);
  }
}
