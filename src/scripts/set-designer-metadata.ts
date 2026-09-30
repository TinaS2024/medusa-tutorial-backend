import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { ERP_MODULE } from "../modules/erp";
import type ErpModuleService from "../modules/erp/service";

/**
 * Schreibt die Designer-Metadaten an die Medusa-Produkte, abgeleitet aus GPE.
 *
 * Gesetzt werden: is_personalized, designer_shape, designer_category,
 * max_width, max_height. NICHT gesetzt wird option_keys – die Zuordnung von
 * Medusa-Optionen zu GPE-Optionsnamen steht nirgends in GPE.
 *
 * Grundlage und Begründung der Regeln: order2gpe/designer-gruppen.md
 *
 *   npm run designer:metadata            nur anzeigen, nichts ändern
 *   npm run designer:metadata -- write   tatsächlich schreiben
 *
 * Der Umweg über npm ist nötig, weil GPE eine interne Zertifizierungsstelle
 * benutzt, die Node nur über NODE_EXTRA_CA_CERTS lädt. Ein nacktes
 * "medusa exec" scheitert mit "fetch failed".
 */

/**
 * Produktgruppen, die KEINE Designer-Metadaten bekommen. Die Gründe stehen
 * hier, damit niemand einen Eintrag versehentlich entfernt:
 *   220STEMPBLD  Prägestempel – ausgeschlossen, solange der Designer erhabene
 *                und vertiefte Schrift (high/low) nicht kennt. Kann danach hier
 *                heraus, die Kategorieableitung greift weiterhin.
 *   150ATWRK     Atelierwerk – gravierte Schiffsglocken, Werkstattarbeit statt
 *                Kundengestaltung. Für Gravuren fehlt ohnehin eine Kategorie.
 *   165PAPRWRN   Papierwaren (Atoma) – Papier. Die Testplatten sind in GPE
 *                entfernt, die Produkte fallen jetzt ohnehin heraus; der
 *                Eintrag bleibt als Schutz, falls wieder eine eingetragen wird.
 *   340VERB      Verbruiksartikelen – Etiketten. Für den Designer vorgemerkt,
 *                aber nicht jetzt.
 *   84010        Drukwerk + P.I. – ein Produkt (600047), noch nicht entschieden.
 *   999test      Testgruppe im Livebestand.
 *   160VERPMARQ, 81210, 80041 – kein Produkt mit Textplatte, fallen ohnehin
 *                heraus; hier gelistet als Nachweis, dass sie geprüft wurden.
 */

const EXCLUDED_GROUPS = new Set([  
  "150ATWRK", "165PAPRWRN", "340VERB", "84010", "220STEMPBLD",
  "160VERPMARQ", "81210", "80041", "999test",
]);

/** Kategorie aus dem Produktions-Workflow der Produktgruppe. */
const CATEGORY_BY_WORKFLOW: Record<string, string> = {
  ProductProcessPraegestempel: "emboss",
  ProductProcessSchilder: "shield",
  ProductProcessGummi: "stamp",
  ProductProcessGummiPlusUVDruck: "stamp",
  ProductProcessLackstempel: "stamp",
  ProductProcessProTampons: "stamp",
  ProductProcessSelbstklebendeLacksiegel: "stamp",
};

/** Größte plausible Textplatte in Millimetern. Darüber sind es Testdaten. */
const MAX_PLATE_MM = 500;

/**
 * Kategorie aus Gruppenname und -beschreibung, wenn der Workflow nichts
 * hergibt (Lagerartikel*, Schablonen). Reihenfolge ist wichtig:
 * "BlinddrukStempels" enthält auch STEMP, ist aber eine Prägung.
 */
function categoryFromName(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes("BLINDDRUK") || t.includes("PRAEGE") || t.includes("PRÄGE")) return "emboss";
  if (t.includes("NAAMPLAT") || t.includes("NAAMBADGE")) return "shield";
  if (t.includes("STEMP") || t.includes("ZEGEL")) return "stamp";
  return null;
}

/** rect / round / oval aus Typ und Maßen der Textplatte. */
function shapeFromPlate(plateTyp: string, width: number, height: number): string | null {
  if (plateTyp === "rectangle") return "rect";
  if (plateTyp === "ellipse") return width === height ? "round" : "oval";
  return null;
}

export default async function setDesignerMetadata(
  { container, args }: { container: any; args: string[] }
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModule = container.resolve(Modules.PRODUCT);
  const erp: ErpModuleService = container.resolve(ERP_MODULE);

  // Bewusst ohne Bindestriche: "medusa exec" benutzt yargs, und das nimmt
  // alles mit -- als eigene Option und lehnt Unbekanntes ab. Durchgereicht
  // werden nur nackte Wörter.
  const shouldWrite = (args ?? []).includes("write");
  logger.info(shouldWrite ? "[designer] SCHREIBEN aktiv" : "[designer] Probelauf – es wird nichts geändert");

  // Medusa-Produkte mit GPE-Artikelnummer, seitenweise
  const allProducts: any[] = [];
  const take = 500;
  let skip = 0;
  while (true) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "metadata"],
      pagination: { skip, take },
    });
    allProducts.push(...data);
    if (data.length < take) break;
    skip += take;
  }
  const candidates = allProducts.filter((p: any) => p.metadata?.gpe_name);
  logger.info(`[designer] ${allProducts.length} Produkt(e) in Medusa, ${candidates.length} mit GPE-Artikelnummer`);

  const skipped: Record<string, number> = {};
  const categories: Record<string, number> = {};
  let updatedCount = 0;

  const noteSkipped = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (let start = 0; start < candidates.length; start += 50) {
    const block = candidates.slice(start, start + 50);
    const names = block.map((p: any) => String(p.metadata.gpe_name).trim());
    const gpeProducts = await erp.getProductsByNames(names);
    const byName = new Map(gpeProducts.map((g: any) => [String(g.name), g]));

    for (const product of block) {
      const name = String(product.metadata.gpe_name).trim();
      const gpe: any = byName.get(name);
      if (!gpe) {
        noteSkipped("nicht in GPE gefunden");
        continue;
      }

      const group = gpe.ProductGroup ?? {};
      const groupName = String(group.name ?? "");
      if (EXCLUDED_GROUPS.has(groupName)) {
        noteSkipped(`Gruppe offen (${groupName})`);
        continue;
      }

      const nameAndDescription = `${name} ${gpe.description ?? ""}`;
      if (nameAndDescription.toUpperCase().includes("TEST")) {
        noteSkipped("Testdatensatz (enthält 'test')");
        continue;
      }

      const plate = gpe.settings?.textPlate;
      const width = Number(plate?.width);
      const height = Number(plate?.height);
      if (!plate || !Number.isFinite(width) || !Number.isFinite(height)) {
        noteSkipped("keine Textplatte");
        continue;
      }
      if (width > MAX_PLATE_MM || height > MAX_PLATE_MM) {
        noteSkipped(`Textplatte unplausibel (${width}x${height} mm)`);
        continue;
      }

      const shape = shapeFromPlate(String(plate.type ?? ""), width, height);
      if (!shape) {
        noteSkipped(`unbekannter Textplatten-Typ (${plate.type})`);
        continue;
      }

      const workflow = String(group.settings?.defaultProductWorkflow ?? "");
      const category =
        CATEGORY_BY_WORKFLOW[workflow] ??
        categoryFromName(`${groupName} ${group.description ?? ""}`);
      if (!category) {
        noteSkipped(`Kategorie nicht ableitbar (${groupName}, ${workflow})`);
        continue;
      }

      // Selbstfärber erkennen: Ein Stempelkissen hat nur ein Selbstfärber. In
      // GPE hängt dafür eine Option KissenfarbeStempel1..4 am Produkt oder an
      // der Produktgruppe – das entspricht genau hasCushion im Designer
      // (Designer_next/src/config/designerRegistry.js). Die Marke taugt NICHT
      // als Merkmal: POSTA COMPLEET hat ein Kissen, POSTA CLIMAX nicht.
      const optionNames = [
        ...((gpe.options ?? []) as any[]),
        ...((group.options ?? []) as any[]),
      ].map((o: any) => String(o?.name ?? ""));
      const hasCushion = optionNames.some((name) => /kissen|kussen|cushion/i.test(name));

      // Holzschild: derzeit genau ein Produkt im Bestand (Holzbrett). Die Regel
      // bleibt allgemein, prüft aber zwingend auch die Kategorie – "Posta
      // Koekjesstempel | beukenhout" ist Holz, aber ein Stempel.
      const isWood = /\bhout\b|\bholz|beuken|eiken|bamboe/i.test(nameAndDescription);

      let finalCategory = category;
      if (category === "stamp" && hasCushion) finalCategory = "self_inking";
      if (category === "shield" && isWood) finalCategory = "wooden_shield";



      const metadata = {
        ...(product.metadata ?? {}),
        is_personalized: true,
        designer_shape: shape,
        designer_category: finalCategory,
        max_width: width,
        max_height: height,
      };

      if (shouldWrite) {
        await productModule.updateProducts(product.id, { metadata });
      }
      updatedCount++;
      categories[`${finalCategory}/${shape}`] = (categories[`${finalCategory}/${shape}`] ?? 0) + 1;
      logger.info(
        `[designer] ${shouldWrite ? "gesetzt" : "würde setzen"}: ${product.title} ` +
        `(${name}) → ${finalCategory}, ${shape}, ${width}x${height} mm`
      );
    }
  }

  logger.info(`[designer] ---`);
  logger.info(`[designer] ${updatedCount} Produkt(e) ${shouldWrite ? "gesetzt" : "wären zu setzen"}`);
  for (const [k, n] of Object.entries(categories).sort()) {
    logger.info(`[designer]   ${n} × ${k}`);
  }
  for (const [reason, n] of Object.entries(skipped).sort((a, b) => b[1] - a[1])) {
    logger.info(`[designer] übersprungen: ${n} × ${reason}`);
  }
  if (!shouldWrite) {
    logger.info(`[designer] Probelauf. Zum Schreiben: npm run designer:metadata -- write`);
  }
}
