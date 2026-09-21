import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { exportInvoices } from "../../../lib/invoice/export-invoices";

/** Wandelt 2026-01-31 in ein Datum. Ungültiges ergibt null. */
const parseDay = (value: unknown, endOfDay: boolean): Date | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Liefert alle Dokumente eines Zeitraums als ZIP.
 *
 * Eigener Pfad `invoice-export` statt `invoices/export`, weil daneben
 * schon `invoices/[id]/…` liegt – ein fester Name und ein Platzhalter an
 * derselben Stelle führen zu schwer auffindbaren Verwechslungen.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const from = parseDay(req.query.from, false);
  const to = parseDay(req.query.to, true);

  if (!from || !to) {
    res.status(400).json({ message: "Bitte Von- und Bis-Datum angeben (JJJJ-MM-TT)." });
    return;
  }

  if (from > to) {
    res.status(400).json({ message: "Das Von-Datum liegt nach dem Bis-Datum." });
    return;
  }

  try {
    const { zip, filename } = await exportInvoices({ container: req.scope, from, to });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(zip);
  } catch (e: any) {
    res.status(400).json({ message: e?.message ?? "Export fehlgeschlagen" });
  }
}
