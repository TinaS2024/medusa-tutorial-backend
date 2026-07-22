import { Module } from "@medusajs/framework/utils"
import ErpModuleService from "./service"

/**
 * Name, unter dem das Modul im Container liegt. Überall zum Auflösen benutzen:
 *
 *   const erp = container.resolve(ERP_MODULE) as ErpModuleService
 */
export const ERP_MODULE = "erp"

export default Module(ERP_MODULE, {
  service: ErpModuleService,
})
