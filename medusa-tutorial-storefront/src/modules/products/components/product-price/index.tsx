import { clx } from "@medusajs/ui";
import { HttpTypes } from "@medusajs/types";
import { useEffect, useMemo, useState } from "react";
import { getCustomVariantPrice } from "../../../../lib/data/products";
import { convertToLocale } from "../../../../lib/util/money";


export default function ProductPrice({
  product,
  variant,
  metadata,
  region,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
  metadata?: Record<string, any>
  region: HttpTypes.StoreRegion
}) 
{
  const [price, setPrice] = useState(0);

  useEffect(() => {
    if (!variant || (product.metadata?.is_personalized && ( !metadata?.height || !metadata?.width ))) {

      return;
    }


    getCustomVariantPrice({ variant_id: variant.id, region_id: region.id, metadata,})

      .then((price) => { setPrice(price) })

      .catch((error) => {

        console.error("Error fetching custom variant price:", error)

      })

  }, [metadata, variant]);


  const displayPrice = useMemo(() => {

    return convertToLocale({ amount: price, currency_code: region.currency_code, })

  }, [price])


  return (

    <div className="flex flex-col text-ui-fg-base">
      <span className={clx("text-xl-semi")} >
        {price > 0 && <span data-testid="product-price" data-value={displayPrice} >
          {displayPrice}
        </span>}
      </span>
    </div>
  )
}