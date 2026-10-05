import { MedusaError } from "@medusajs/framework/utils";
import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import { INVOICE_PAYMENT_PROVIDER_ID, readCustomerNumber } from "../../lib/customer-number";

/**
 * Kauf auf Rechnung nur für Kunden mit Kundennummer.
 *
 * Läuft beim Bestellabschluss, bevor irgendetwas angelegt wird. Der Shop
 * blendet "Auf Rechnung" zwar aus, wenn der Kunde keine Nummer hat – diese
 * Prüfung hier ist aber die eigentliche Sperre. Sie greift auch dann, wenn
 * jemand den Server direkt anspricht.
 *
 * has_account: Bei einer Gastbestellung legt Medusa einen eigenen
 * Gast-Kundensatz an. Der hat nie eine Kundennummer – zur Sicherheit wird
 * trotzdem ausdrücklich ein echtes Kundenkonto verlangt.
 */
completeCartWorkflow.hooks.validate(async ({ cart }) => {
  const sessions: any[] = (cart as any).payment_collection?.payment_sessions ?? [];
  const paysByInvoice = sessions.some(
    (session) => session?.provider_id === INVOICE_PAYMENT_PROVIDER_ID
  );

  if (!paysByInvoice) 
  {
    return;
  }

  const customer = (cart as any).customer;

  if (!customer?.has_account || !readCustomerNumber(customer.metadata)) 
  {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Kauf auf Rechnung ist nur für freigeschaltete Kundenkonten möglich. Bitte wählen Sie eine andere Zahlungsart."
    );
  }
});
