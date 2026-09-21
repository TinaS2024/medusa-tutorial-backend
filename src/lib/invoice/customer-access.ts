import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";

/**
 * Gehört die Bestellung dem angemeldeten Kunden?
 *
 * Benutzen alle Store-Routen, die Rechnungen herausgeben. Die Anmeldung
 * allein genügt nicht: Ohne diese Prüfung könnte jeder angemeldete Kunde
 * durch Raten von Nummern an fremde Rechnungen kommen – mit Namen,
 * Anschrift und Kaufhistorie.
 */
export async function customerOwnsOrder(
  req: AuthenticatedMedusaRequest,
  orderId: string
): Promise<boolean> {
  const customerId = req.auth_context?.actor_id;

  if (!customerId) return false;

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: orderId },
  });

  // Gastbestellungen haben keine customer_id – die gehören niemandem und
  // sind über das Kundenkonto nicht erreichbar.
  return Boolean(order?.customer_id && order.customer_id === customerId);
}
