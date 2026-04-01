import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

type PersonalizationPriceResponse = {
  dimension_price_factor: number | null
}

type PostPersonalizationPriceBody = {
  dimension_price_factor: number
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<PersonalizationPriceResponse>
) => {
  const productModuleService = req.scope.resolve(Modules.PRODUCT)
  const productId = req.params.id

  const product = await productModuleService.retrieveProduct(productId)

  const rawFactor = (product.metadata as any)?.dimension_price_factor
  const factor =
    typeof rawFactor === "number" ? rawFactor : Number(rawFactor ?? NaN)

  const value = Number.isFinite(factor) ? factor : null

  res.json({
    dimension_price_factor: value,
  })
}

export const POST = async (
  req: MedusaRequest<PostPersonalizationPriceBody>,
  res: MedusaResponse<PersonalizationPriceResponse>
) => {
  const productModuleService = req.scope.resolve(Modules.PRODUCT)
  const productId = req.params.id
  const { dimension_price_factor } = req.body

  const numericFactor = Number(dimension_price_factor)

  if (!Number.isFinite(numericFactor) || numericFactor < 0) {
    res.status(400).json({
      dimension_price_factor: null,
    })
    return
  }

  const product = await productModuleService.retrieveProduct(productId)

  const metadata = {
    ...(product.metadata ?? {}),
    dimension_price_factor: numericFactor,
  }

  const updatedProduct = await productModuleService.updateProducts(
    productId,
    { metadata }
  )

  const rawFactor = (updatedProduct.metadata as any)?.dimension_price_factor
  const factor =
    typeof rawFactor === "number" ? rawFactor : Number(rawFactor ?? NaN)

  const value = Number.isFinite(factor) ? factor : numericFactor

  res.json({
    dimension_price_factor: value,
  })
}