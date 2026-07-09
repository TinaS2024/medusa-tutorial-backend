import { MedusaService } from "@medusajs/framework/utils";
import { OrderProduction } from "./models/order-production";
import { OrderProductionEvent } from "./models/order-production-event";

export default class OrderProductionModuleService extends MedusaService({
  OrderProduction,
  OrderProductionEvent,
}) {}
