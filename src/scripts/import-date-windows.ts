import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { promises as fs } from "fs";
import { resolve } from "path";

/**
 * Überträgt die Datumsfenster aus der Handliste katalog-import/datumsfenster.csv
 * in die Varianten-Metadaten (Feld date_windows). Der Designer zeichnet daraus
 * die Sperrfläche bei Datumstempeln.
 *
 * Übernommen werden nur Zeilen mit Status "geprüft". Maße in mm, gezählt ab der
 * linken oberen Ecke der Textplatte; "mitte" wird hier in eine Zahl umgerechnet.
 *
 *   npx medusa exec ./src/scripts/import-date-windows.ts         nur anzeigen
 *   npx medusa exec ./src/scripts/import-date-windows.ts write   tatsächlich schreiben
 */

type DateWindow = {
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  margin: number;
  label: string;
};

/** "1,5" oder "1.5" -> 1.5; leer oder unlesbar -> null */
const toNumber = (text: string | undefined) => {
  const value = Number(String(text ?? "").replace(",", ".").trim());
  return text?.trim() && Number.isFinite(value) ? value : null;
};

/** Lage als Zahl; "mitte" setzt das Fenster mittig auf die Platte. */
const toPosition = (text: string | undefined, plateSize: number, windowSize: number) =>
  String(text ?? "").trim().toLowerCase() === "mitte"
    ? Math.round(((plateSize - windowSize) / 2) * 100) / 100
    : toNumber(text);

export default async function importDateWindows({ container, args }: { container: any; args: string[] }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModule = container.resolve(Modules.PRODUCT);

  const shouldWrite = (args ?? []).includes("write");
  const file = resolve("../katalog-import/datumsfenster.csv");
  logger.info(`[datum] lese ${file}${shouldWrite ? " – SCHREIBEN aktiv" : " – Probelauf, es wird nichts geändert"}`);

  // Das unsichtbare BOM am Anfang entfernen (steht drin, damit Excel Umlaute richtig zeigt).
  const text = (await fs.readFile(file, "utf-8")).replace(/^\uFEFF/, "");
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  const columns = header.split(";").map((c) => c.trim());
  const rows = lines.map((line) => {
    const cells = line.split(";");
    return Object.fromEntries(columns.map((name, i) => [name, (cells[i] ?? "").trim()]));
  });

  // Nur geprüfte Zeilen, gruppiert nach Variante (SKU) – ein Stempel kann mehrere Fenster haben.
  const rowsBySku = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    if (row.status !== "geprüft") continue;
    rowsBySku.set(row.sku, [...(rowsBySku.get(row.sku) ?? []), row]);
  }
  logger.info(`[datum] ${rowsBySku.size} Variante(n) mit Status "geprüft"`);
  if (!rowsBySku.size) return;

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "title", "width", "height", "metadata"],
    filters: { sku: [...rowsBySku.keys()] },
  });
  const variantBySku = new Map((variants as any[]).map((v) => [v.sku, v]));

  let updated = 0;
  let failed = 0;

  for (const [sku, skuRows] of rowsBySku) {
    const variant = variantBySku.get(sku);
    if (!variant) {
      failed++;
      logger.error(`[datum] ✗ ${sku}: Variante nicht in Medusa gefunden`);
      continue;
    }
    const plateWidth = Number(variant.width);
    const plateHeight = Number(variant.height);

    const problems: string[] = [];
    const windows = skuRows
      .sort((a, b) => Number(a.fenster_nr) - Number(b.fenster_nr))
      .map((row): DateWindow => {
        const width = toNumber(row.fenster_breite_mm);
        const height = toNumber(row.fenster_hoehe_mm);
        const x = width === null ? null : toPosition(row.lage_waagerecht, plateWidth, width);
        const y = height === null ? null : toPosition(row.lage_senkrecht, plateHeight, height);
        if (width === null || height === null || x === null || y === null) {
          problems.push(`Fenster ${row.fenster_nr}: Maß oder Lage fehlt`);
        } else if (x < 0 || y < 0 || x + width > plateWidth || y + height > plateHeight) {
          problems.push(`Fenster ${row.fenster_nr}: liegt nicht ganz auf der Platte (${plateWidth} x ${plateHeight} mm)`);
        }
        return {
          shape: row.fenster_form === "ellipse" ? "ellipse" : "rect",
          x: x ?? 0,
          y: y ?? 0,
          width: width ?? 0,
          height: height ?? 0,
          margin: toNumber(row.abstand_mm) ?? 0,
          label: row.beschriftung || "Datum",
        };
      });

    if (problems.length) {
      failed++;
      logger.error(`[datum] ✗ ${sku} (${variant.title}): ${problems.join("; ")}`);
      continue;
    }

    if (shouldWrite) {
      await productModule.updateProductVariants(variant.id, {
        metadata: { ...(variant.metadata ?? {}), date_windows: windows },
      });
    }
    updated++;
    logger.info(`[datum] ${shouldWrite ? "✓ gesetzt" : "würde setzen"}: ${sku} (${variant.title}) → ${JSON.stringify(windows)}`);
  }

  logger.info(`[datum] Fertig: ${updated} Variante(n) ${shouldWrite ? "geändert" : "würden geändert"}, ${failed} mit Fehler.`);
}
