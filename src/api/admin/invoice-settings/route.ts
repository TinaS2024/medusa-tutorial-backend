import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { INVOICE_MODULE } from "../../../modules/invoice";
import { PRODUCTION_STATUSES } from "../../../modules/order-production/models/order-production";

/** Wer erstellt die Rechnungen? */
const SOURCES = ["none", "medusa", "gpe"] as const;

/** In welchem Land sitzt der Betreiber des Shops? */
const COUNTRIES = ["de", "fr", "nl", "gb"] as const;

const toText = (v: unknown) => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};

/** Wie `toText`, aber mit Vorgabewert statt null – für die Präfixe. */
const toTextWithDefault = (v: unknown, fallback: string) => toText(v) ?? fallback;

/** Ganze Zahl in Grenzen halten. Schützt vor Tippfehlern wie "Stellen: 999". */
const toInteger = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
};

/** Nur erlaubte Werte durchlassen, sonst den Vorgabewert. */
const toOption = (v: unknown, allowed: readonly string[], fallback: string) =>
  typeof v === "string" && allowed.includes(v) ? v : fallback;

/**
 * Prüft und vervollständigt die Einstellungen.
 *
 * Wird an zwei Stellen benutzt: beim Lesen aus den Shop-Zusatzdaten und
 * beim Speichern der Formulardaten. Dadurch gelten für beides exakt
 * dieselben Regeln – es kann nichts in der Datenbank landen, was beim
 * Lesen anders behandelt würde.
 */
function normalizeSettings(input: Record<string, unknown>) {
  return {
    invoice_source: toOption(input.invoice_source, SOURCES, "none"),
    invoice_trigger_status: toOption(
      input.invoice_trigger_status,
      PRODUCTION_STATUSES,
      "ready_to_ship"
    ),
    invoice_seller_country: toOption(input.invoice_seller_country, COUNTRIES, "de"),
    invoice_tax_number: toText(input.invoice_tax_number),
    invoice_payment_terms_days: toInteger(input.invoice_payment_terms_days, 14, 0, 365),
    invoice_footer_note: toText(input.invoice_footer_note),
    invoice_number_prefix: toTextWithDefault(input.invoice_number_prefix, "RE-"),
    invoice_number_pad_length: toInteger(input.invoice_number_pad_length, 6, 1, 12),
    invoice_correction_prefix: toTextWithDefault(input.invoice_correction_prefix, "GS-"),
    invoice_correction_pad_length: toInteger(input.invoice_correction_pad_length, 6, 1, 12),
  };
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? {};

  res.json({ invoice_settings: normalizeSettings(md) });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) {
    res.status(400).json({ message: "No store found" });
    return;
  }

  const values = normalizeSettings((req.body ?? {}) as Record<string, unknown>);

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  await storeModuleService.updateStores(
    { id: store.id },
    { metadata: { ...prev, ...values } }
  );

  // Hier entstehen die beiden Nummernkreise. Bei einer frischen Installation
  // ist die Tabelle leer – der erste Klick auf "Speichern" legt sie an.
  // `last_number` wird dabei nie angefasst, nur Präfix und Länge.
  const invoiceService: any = req.scope.resolve(INVOICE_MODULE);

  await invoiceService.ensureSeries(
    "invoice",
    values.invoice_number_prefix,
    values.invoice_number_pad_length
  );
  await invoiceService.ensureSeries(
    "correction",
    values.invoice_correction_prefix,
    values.invoice_correction_pad_length
  );

  res.json({ invoice_settings: values });
}
