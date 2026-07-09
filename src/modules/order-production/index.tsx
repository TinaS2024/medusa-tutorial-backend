import { Module } from "@medusajs/framework/utils";
import OrderProductionModuleService from "./service";

export const ORDER_PRODUCTION_MODULE = "orderProduction";

export default Module(ORDER_PRODUCTION_MODULE, {
  service: OrderProductionModuleService,
});
