import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  deleteCartCreditLinesWorkflow,
  refreshPaymentCollectionForCartWorkflow,
} from "@medusajs/medusa/core-flows";
import { GIFT_CARD_CREDIT_REFERENCE } from "../../../../../../lib/gift-card";

/**
 * Nimmt eine eingelöste Geschenkkarte wieder aus dem Warenkorb.
 *
 *   DELETE /store/carts/:id/gift-cards/:giftCardId
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) 
{
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at", "credit_lines.*"],
    filters: { id: req.params.id },
  });

  if (!cart || cart.completed_at) 
  {
    res.status(404).json({ message: "Warenkorb nicht gefunden." });
    return;
  }

  const lines = (cart.credit_lines ?? []).filter(
    (line: any) =>
      line?.reference === GIFT_CARD_CREDIT_REFERENCE &&
      line?.reference_id === req.params.giftCardId
  );

  if (lines.length === 0) 
  {
    res.status(404).json({ message: "Diese Geschenkkarte ist nicht im Warenkorb." });
    return;
  }

  await deleteCartCreditLinesWorkflow(req.scope).run({
    input: { id: lines.map((line: any) => line.id) },
  });

  await refreshPaymentCollectionForCartWorkflow(req.scope).run({
    input: { cart_id: cart.id },
  });

  res.json({ removed: true });
}
