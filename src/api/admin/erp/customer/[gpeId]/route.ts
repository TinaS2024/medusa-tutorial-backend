import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ERP_MODULE } from "../../../../../modules/erp"
import type ErpModuleService from "../../../../../modules/erp/service"

/**
 * Kunde aus GPE lesen – kleinster Durchstich zum Testen der Anbindung.
 *
 *   GET /admin/erp/customer/10-000-001
 *
 * Das ist bewusst eine Admin-Route: GPE-Kundendaten (inkl. Rabatt) gehören
 * nicht in den Storefront.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { gpeId } = req.params

  // Hier kommt der Container her: in API-Routen heißt er req.scope.
  // In Subscribern bekommst du ihn stattdessen als Argument (siehe
  // src/subscribers/order-placed-gpe.ts).
  const erp: ErpModuleService = req.scope.resolve(ERP_MODULE)

  try {
    const customer = await erp.getCustomer(gpeId)

    if (!customer) {
      res.status(404).json({ message: `Kein GPE-Kunde mit der ID ${gpeId}` })
      return
    }

    // Bewusst nicht das rohe GPE-Objekt durchreichen – GPE liefert deutlich
    // mehr Felder, als hier jemand braucht.
    res.json({
      id: customer.id,
      company: customer.company ?? null,
      email: customer.email ?? null,
      language: customer.language ?? null,
      addresses: customer.addresses ?? [],
      designerDiscount: customer.stringData?.designerDiscount ?? null,
    })
  } catch (err: any) {
    // 502 statt 500: Der Fehler liegt beim Fremdsystem (GPE nicht erreichbar,
    // Zugangsdaten fehlen, Token abgelehnt), nicht in unserem Code.
    res.status(502).json({ message: err?.message ?? "GPE-Aufruf fehlgeschlagen" })
  }
}
