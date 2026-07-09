import { model } from "@medusajs/framework/utils";
import { OrderProductionEvent } from "./order-production-event";

export const PRODUCTION_STATUSES = [
  "received",
  "paid",
  "in_design",
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
  "cancelled",
] as const;

export const OrderProduction = model.define("order_production", {
  id: model.id().primaryKey(),
  order_id: model.text().unique(),
  status: model.enum([...PRODUCTION_STATUSES]).default("received"),
  note: model.text().nullable(),
  events: model.hasMany(() => OrderProductionEvent, {
    mappedBy: "production",
  }),
});
