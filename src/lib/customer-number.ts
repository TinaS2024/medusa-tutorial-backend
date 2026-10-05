/**
 * Kennung des Zahlungsanbieters "Auf Rechnung".
 * Medusa bildet sie aus "pp_" + identifier (service.ts) + "_" + id (medusa-config.ts).
 */
export const INVOICE_PAYMENT_PROVIDER_ID = "pp_invoice_invoice";

/** Die Kundennummer aus customer.metadata als Text, oder "" wenn keine da ist. */
export const readCustomerNumber = (metadata: unknown): string => {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.customer_number;
  return typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
};
