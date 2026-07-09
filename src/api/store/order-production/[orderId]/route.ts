import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ORDER_PRODUCTION_MODULE } from "../../../../modules/order-production";

export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const { orderId } = req.params;
  const service: any = req.scope.resolve(ORDER_PRODUCTION_MODULE);
  const [p] = await service.listOrderProductions({ order_id: orderId }, { take: 1 });
  res.json({ status: p?.status ?? "received" });
}
