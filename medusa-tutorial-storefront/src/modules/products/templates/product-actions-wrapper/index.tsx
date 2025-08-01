import { listProducts } from "@lib/data/products";
import { HttpTypes } from "@medusajs/types";
import ProductActions from "@modules/products/components/product-actions";
import { BundleProduct } from "@lib/data/products";
import BundleActions from "@modules/products/components/bundle-actions";

/**
 * Fetches real time pricing for a product and renders the product actions component.
 */
export default async function ProductActionsWrapper({
  id,
  region,
  bundle,
}: {
  id: string
  region: HttpTypes.StoreRegion
  bundle?: BundleProduct
}) {
  const product = await listProducts({
    queryParams: { id: [id] },
    regionId: region.id,
  }).then(({ response }) => response.products[0])

  if (!product) {
    return null
  }

  if(bundle)
  {
    return <BundleActions bundle={bundle}/>
  }

  return <ProductActions product={product} region={region} />
}
