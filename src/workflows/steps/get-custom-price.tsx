import { ProductVariantDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ERP_MODULE } from "../../modules/erp";
import type ErpModuleService from "../../modules/erp/service";
import type { GpeCustomer, GpeProductInfo } from "../../modules/erp/client/types";


export type GetCustomPriceStepInput = {
  variant: ProductVariantDTO & {
    calculated_price?: {
      calculated_amount: number
    }
  }
  metadata?: Record<string, unknown>
  /** Menge. Preisrelevant, weil GPE Staffelpreise rechnet. */
  quantity?: number
  /** Medusa-Kunde. Nötig für den kundenspezifischen GPE-Rabatt. */
  customer_id?: string | null
}

const DEFAULT_DIMENSION_PRICE_FACTOR = 0.01;

/**
 * Preis aus der GPE-Antwort ziehen.
 *
 * ABSICHTLICH NOCH NICHT IMPLEMENTIERT. Wie GPE den Preis in ProductInfoJson
 * benennt, war aus dem Rossini-Code nicht ablesbar. Ein geratener Feldname
 * würde still den falschen Preis liefern – deshalb lieber ein lauter Fehler.
 *
 * So füllst du es aus:
 *   1. npx tsx src/modules/erp/client/smoke-test.ts
 *   2. Schritt 4 gibt die Rohantwort von ProductInfoJson aus → Preisfeld ablesen
 *   3. Hier eintragen. Auf die Einheit achten: Medusa v2 rechnet dezimal
 *      (nicht in Cent), GPE liefert laut Rossini-Daten ebenfalls dezimal (z.B. 19.93).
 */
function extractPrice(info: GpeProductInfo): number {
  // GPE liefert den Stückpreis dezimal (z.B. 10.11) unter Product.settings.price.
  // Bestätigt an der echten ProductInfoJson-Antwort für 4911 (Company 999).
  // GPE liefert nicht immer einen Preis (vgl. priceController.js: noPriceInGPE) –
  // dann ist die Kombination nicht bepreisbar, also lauter Fehler statt NaN.
  const price = info?.Product?.settings?.price
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "GPE liefert für diese Kombination keinen Preis (Product.settings.price fehlt oder ist keine Zahl)."
    )
  }
  return price
}


/**
 * width/height gehen bei GPE als additionalFields mit – in Zentimetern.
 * Rossini rechnet dafür mm/10 auf eine Nachkommastelle (ProductSettingsFromGPE.js),
 * das spiegeln wir hier.
 */
function buildAdditionalFieldValues(metadata: Record<string, unknown>): unknown[] {
  const fields: { 
    fieldName: string; 
    value: unknown 
    fieldType?: string
    componentSettingsPath: unknown[]
  }[] = []
  const toCm = (mm: number) => Math.round((mm / 10) * 10) / 10

  const width = Number(metadata.width)
  if (Number.isFinite(width)) {
    fields.push({ fieldName: "width", fieldType: "float",value: toCm(width), componentSettingsPath: [] })
  }
  const height = Number(metadata.height)
  if (Number.isFinite(height)) {
    fields.push({ fieldName: "height", fieldType: "float", value: toCm(height), componentSettingsPath: [] })
  }

  // Weitere GPE-AdditionalFields (Freitexte etc.) reicht der Storefront
  // als Objekt unter gpe_additional_fields durch.
  const extra = metadata.gpe_additional_fields
  if (extra && typeof extra === "object") {
    for (const [fieldName, value] of Object.entries(extra as Record<string, unknown>)) {
      fields.push({ fieldName, value, componentSettingsPath: [] })
    }
  }
  return fields
}

/**
 * Medusa-Kunde → GPE-Kunde. Kostet einen zusätzlichen GPE-Aufruf pro
 * Preisabfrage; nötig, weil der Rabatt (stringData.designerDiscount) am
 * GPE-Kunden hängt. Ohne angemeldeten Kunden gibt es keinen Rabatt.
 */
async function resolveGpeCustomer(
  container: any,
  customerId?: string | null
): Promise<GpeCustomer | undefined> {
  if (!customerId) {
    return undefined
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [customer] } = await query.graph({
    entity: "customer",
    fields: ["metadata"],
    filters: { id: customerId },
  })

  const gpeId = (customer?.metadata as any)?.gpe_id
  if (!gpeId) {
    return undefined
  }
  const erp: ErpModuleService = container.resolve(ERP_MODULE)
  return (await erp.getCustomer(String(gpeId))) ?? undefined
}

export const getCustomPriceStep = createStep("get-custom-price",

  async (
    { variant, metadata = {}, quantity = 1, customer_id }: GetCustomPriceStepInput,
    { container }
  ) => {

    const product = variant.product

    if (!product?.metadata?.is_personalized)
    {
      return new StepResponse(variant.calculated_price?.calculated_amount || 0)
    }

    // ---------------------------------------------------------------- GPE
    // Ist gpe_id gesetzt, entscheidet GPE über Preis UND Gültigkeit.
    // Die lokalen max_*-Prüfungen weiter unten gelten hier bewusst NICHT –
    // sie wären eine zweite Wahrheit neben GPE und würden früher oder
    // später still davon abweichen.
    if (product.metadata.gpe_id)
    {
      const erp: ErpModuleService = container.resolve(ERP_MODULE)
      const gpeCustomer = await resolveGpeCustomer(container, customer_id)

      const info = await erp.getProductInfo({
        product: {
          gpe_id: Number(product.metadata.gpe_id),
          gpe_name: String(product.metadata.gpe_name ?? ""),
          externalID: product.metadata.gpe_external_id as string | undefined,
        },
        optionValues: (metadata.gpe_option_values as unknown[]) ?? [],
        additionalFieldValues: buildAdditionalFieldValues(metadata),
        count: quantity,
        gpeCustomer,
        useDefaultOptionValues: false,
      })

      if (!info)
      {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "GPE liefert für diese Optionskombination keinen Preis – vermutlich ist sie ungültig."
        )
      }
      return new StepResponse(extractPrice(info))
    }

    // ------------------------------------------------- bisheriger Pfad
    // Unverändert: gilt für alle personalisierten Produkte ohne gpe_id.

    const height = Number(metadata.height)
    const width = Number(metadata.width)

    if (!metadata.height || !metadata.width || isNaN(height) || isNaN(width))
    {
      throw new MedusaError(MedusaError.Types.INVALID_DATA,"Custom price requires width and height metadata to be set.")
    }

    const maxHeight = Number(product?.metadata?.max_height)
    const maxWidth = Number(product?.metadata?.max_width)

    if (!isNaN(maxHeight) && height > maxHeight)
    {
      throw new MedusaError(MedusaError.Types.INVALID_DATA,"Height exceeds the maximum allowed height for this product.")
    }

    if (!isNaN(maxWidth) && width > maxWidth)
    {
      throw new MedusaError(MedusaError.Types.INVALID_DATA,"Width exceeds the maximum allowed width for this product.")
    }

    const rawFactor = (product?.metadata as any)?.dimension_price_factor;
    const factorFromMetadata = typeof rawFactor === "number" ? rawFactor : Number(rawFactor);
    const dimensionPriceFactor = Number.isFinite(factorFromMetadata) ? factorFromMetadata : DEFAULT_DIMENSION_PRICE_FACTOR;

    const areaInMm2 = height * width;
    const areaInCm2 = areaInMm2 / 100;
    const priceFromArea = areaInCm2 * dimensionPriceFactor;

    const originalPrice = variant.calculated_price?.calculated_amount || 0;
    const customPrice = originalPrice + priceFromArea;

    return new StepResponse(customPrice);

  }

)
