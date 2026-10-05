import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Schlüssel in customer.metadata, die nur im Admin gesetzt werden dürfen.
 * Kommt später die Kundennummer für den Rechnungskauf dazu, wird sie hier
 * ergänzt.
 */
export const PROTECTED_CUSTOMER_METADATA_KEYS = ["gpe_id", "customer_number"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Setzt in den mitgeschickten Daten die geschützten Schlüssel auf den
 * gespeicherten Wert zurück. Gibt es keinen gespeicherten Wert, wird der
 * Schlüssel entfernt.
 *
 * Schickt die Anfrage gar kein metadata mit, ändert Medusa die Metadaten
 * nicht – dann gibt es hier auch nichts zu tun.
 */
function restoreProtectedKeys(
  target: Record<string, unknown> | undefined,
  stored: Record<string, unknown>
) {
  if (!target || !("metadata" in target)) return;

  // metadata: null würde alle Metadaten löschen, auch die geschützten.
  // Deshalb behandeln wir null wie ein leeres Objekt.
  const metadata = isObject(target.metadata) ? { ...target.metadata } : {};

  for (const key of PROTECTED_CUSTOMER_METADATA_KEYS) 
  {
    if (key in stored) 
    {
      metadata[key] = stored[key];
    } 
    else 
    {
      delete metadata[key];
    }
  }

  target.metadata = metadata;
}

/**
 * Schutz für die Shop-Routen, über die ein Kunde seine eigenen Daten
 * schreibt (Registrierung und "Mein Konto").
 *
 * Medusa erlaubt dort das Feld metadata – die Designs-Seite braucht das.
 * Ohne diesen Schutz könnte sich ein Kunde aber selbst eine fremde gpe_id
 * eintragen und bekäme damit die Rabatte dieser Firma.
 */
export async function protectCustomerMetadata(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Bei der Registrierung gibt es noch keinen Kunden – dann ist "gespeichert"
  // leer, und alle geschützten Schlüssel werden entfernt.
  let stored: Record<string, unknown> = {};

  const customerId = (req as any).auth_context?.actor_id;
  if (customerId) 
  {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const {
      data: [customer],
    } = await query.graph({
      entity: "customer",
      fields: ["metadata"],
      filters: { id: customerId },
    });
    stored = isObject(customer?.metadata) ? customer.metadata : {};
  }

  // Beide Fassungen korrigieren: das Original und die geprüfte Kopie,
  // falls Medusa sie schon angelegt hat. Gespeichert wird die Kopie.
  restoreProtectedKeys(req.body as Record<string, unknown> | undefined, stored);
  restoreProtectedKeys((req as any).validatedBody, stored);

  next();
}
