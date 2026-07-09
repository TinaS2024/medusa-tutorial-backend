import { model } from "@medusajs/framework/utils";
import { OrderProduction } from "./order-production";

export const OrderProductionEvent = model.define("order_production_event", {
  id: model.id().primaryKey(),
  status: model.text(),
  production: model.belongsTo(() => OrderProduction, {
    mappedBy: "events",
  }),
});
