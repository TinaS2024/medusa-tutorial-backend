import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import InvoicePaymentProviderService from "./service";

/** Meldet "Auf Rechnung" beim Zahlungsmodul von Medusa an. */
export default ModuleProvider(Modules.PAYMENT, {
  services: [InvoicePaymentProviderService],
});
