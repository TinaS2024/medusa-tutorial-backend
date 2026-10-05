import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { INVOICE_MODULE } from "../../../../modules/invoice";
import type InvoiceModuleService from "../../../../modules/invoice/service";

/** Vorsatz und Stellenzahl für Kundennummern, die Medusa selbst vergibt: K-00001. */
const CUSTOMER_NUMBER_PREFIX = "K-";
const CUSTOMER_NUMBER_PAD = 5;

type AssignBody = { source?: "series" | "gpe" }

const readText = (v: unknown) =>
  typeof v === "string" || typeof v === "number" ? String(v).trim() : "";

async function loadCustomer(req: MedusaRequest) {
  const customerModule = req.scope.resolve(Modules.CUSTOMER);
  const customer = await customerModule
    .retrieveCustomer(req.params.customerId)
    .catch(() => null);
  return { customerModule, customer };
}

/**
 * Gibt dem Kunden eine Kundennummer und damit das Recht, auf Rechnung zu
 * kaufen.
 *
 *   POST /admin/customer-number/:customerId
 *   Body: { source: "series" }  → nächste Nummer aus dem Nummernkreis (K-00001 …)
 *         { source: "gpe" }     → die GPE-Kundennummer (metadata.gpe_id) übernehmen
 *
 * Hat der Kunde schon eine Nummer, wird abgelehnt. Eine Nummer soll nie
 * versehentlich ausgetauscht werden – erst entfernen, dann neu vergeben.
 */
export async function POST(req: MedusaRequest<AssignBody>, res: MedusaResponse) 
{
  const { customerModule, customer } = await loadCustomer(req);
  if (!customer) 
  {
    res.status(404).json({ message: "Kunde nicht gefunden." });
    return;
  }

  const metadata = (customer.metadata ?? {}) as Record<string, unknown>;

  if (readText(metadata.customer_number)) 
  {
    res.status(409).json({ message: "Der Kunde hat schon eine Kundennummer. Bitte erst entfernen." });
    return;
  }

  let customerNumber: string;

  if (req.body?.source === "gpe") 
  {
    customerNumber = readText(metadata.gpe_id);
    if (!customerNumber) 
    {
      res.status(400).json({ message: "Der Kunde ist nicht mit GPE verknüpft. Bitte zuerst die GPE-Nummer speichern." });
      return;
    }
  } 
  else 
  {
    const invoiceService: InvoiceModuleService = req.scope.resolve(INVOICE_MODULE);
    // Legt den Nummernkreis beim allerersten Mal an.
    await invoiceService.ensureSeries("customer", CUSTOMER_NUMBER_PREFIX, CUSTOMER_NUMBER_PAD);
    customerNumber = await invoiceService.nextNumber("customer");
  }

  // Frisch gelesene Metadaten weitergeben, damit nichts anderes verloren geht.
  await customerModule.updateCustomers(customer.id, {
    metadata: { ...metadata, customer_number: customerNumber },
  });

  res.json({ customer_number: customerNumber });
}

/**
 * Entfernt die Kundennummer – der Kunde kann danach nicht mehr auf
 * Rechnung kaufen. Bereits ausgestellte Rechnungen behalten ihre Nummer.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) 
{
  const { customerModule, customer } = await loadCustomer(req);
  if (!customer) 
  {
    res.status(404).json({ message: "Kunde nicht gefunden." });
    return;
  }

  const metadata = (customer.metadata ?? {}) as Record<string, unknown>;
  await customerModule.updateCustomers(customer.id, {
    metadata: { ...metadata, customer_number: null },
  });

  res.json({ customer_number: null });
}
