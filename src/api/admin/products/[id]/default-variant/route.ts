import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

type DefaultVariantResponse = {
  default_variant_id: string | null
}

type PostDefaultVariantBody = {
  variant_id: string
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<DefaultVariantResponse>
) => {
  const productModuleService = req.scope.resolve(Modules.PRODUCT)
  const productId = req.params.id

  const product = await productModuleService.retrieveProduct(productId)

  res.json({
    default_variant_id:
      (product.metadata as any)?.default_variant_id ?? null,
  })
}

export const POST = async (
  req: MedusaRequest<PostDefaultVariantBody>,
  res: MedusaResponse<DefaultVariantResponse>
) => {
  const productModuleService = req.scope.resolve(Modules.PRODUCT)
  const productId = req.params.id
  const { variant_id } = req.body

  if (!variant_id) {
    res.status(400).json({ default_variant_id: null })
    return
  }

  const product = await productModuleService.retrieveProduct(productId)

  const metadata = {
    ...(product.metadata ?? {}),
    default_variant_id: variant_id,
  }

  const updatedProduct = await productModuleService.updateProducts(
    productId,
    { metadata }
  )

  res.json({
    default_variant_id:
      (updatedProduct.metadata as any)?.default_variant_id ?? variant_id,
  })
}