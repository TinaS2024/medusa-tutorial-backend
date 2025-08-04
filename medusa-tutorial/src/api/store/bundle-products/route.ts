import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")
  
  const queryConfig = {
    ...req.queryConfig,
    expand: "items.product",
  }

  const {
    data: bundledProducts,
    metadata: { count, take, skip } = {},
  } = await query.graph({
    entity: "bundle",
    ...queryConfig,
  })

  res.json({
    bundled_products: bundledProducts,
    count: count || 0,
    limit: take || 15,
    offset: skip || 0,
  })
}