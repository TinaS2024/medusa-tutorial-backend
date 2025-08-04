import { Text } from "@medusajs/ui";
import { BundleProduct } from "@lib/data/products";
import { getBundlePrice } from "@lib/util/get-bundle-price";
import { HttpTypes } from "@medusajs/types";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import Thumbnail from "../thumbnail";
import PreviewPrice from "./price";


export default async function BundlePreview({
  bundle,
  region,
}: {
  bundle: BundleProduct
  region: HttpTypes.StoreRegion
}) {

    if (!bundle || !bundle.items || bundle.items.length === 0) {
    return null
  }

  const { cheapestPrice } = getBundlePrice({bundle});

  return (
    <LocalizedClientLink href={`/bundles/${bundle.id}`} className="group">
      <div data-testid="bundle-wrapper">
        <Thumbnail
          thumbnail={bundle.items[0].product.thumbnail}
          images={bundle.items[0].product.images}
          size="full"
        />
        <div className="flex txt-compact-medium mt-4 justify-between">
          <Text className="text-ui-fg-subtle" data-testid="bundle-title">
            {bundle.title}
          </Text>
          <div className="flex items-center gap-x-2">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
