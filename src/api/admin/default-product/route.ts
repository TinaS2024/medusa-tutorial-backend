import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

type DefaultProductResponse = {
  default_product_id: string | null
}

type PostDefaultProductBody = {
  product_id: string
}

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<DefaultProductResponse>
) => {
  const storeModuleService = req.scope.resolve(Modules.STORE)

  const [store] = await storeModuleService.listStores({}, { take: 1 })

  res.json({
    default_product_id: (store?.metadata as any)?.default_product_id ?? null,
  })
}

export const POST = async (
  req: MedusaRequest<PostDefaultProductBody>,
  res: MedusaResponse<DefaultProductResponse>
) => {
  const { product_id } = req.body

  if (!product_id) {
    res.status(400).json({ default_product_id: null })
    return
  }

  const storeModuleService = req.scope.resolve(Modules.STORE)
  const [store] = await storeModuleService.listStores({}, { take: 1 })

  if (!store) {
    res.status(400).json({ default_product_id: null })
    return
  }

  const metadata = {
    ...(store.metadata ?? {}),
    default_product_id: product_id,
  }

   await storeModuleService.updateStores(
    { id: store.id },
    { metadata }
  )


  res.json({ default_product_id: product_id })
}