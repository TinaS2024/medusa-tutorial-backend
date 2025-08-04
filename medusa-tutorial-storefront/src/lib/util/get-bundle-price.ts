import { getPercentageDiff } from "./get-precentage-diff";
import { convertToLocale } from "./money";
import { BundleProduct } from "@lib/data/products";

export const getPricesForVariant = (variant: any) => {
  if (!variant?.calculated_price?.calculated_amount) {
    return null
  }

  return {
    calculated_price_number: variant.calculated_price.calculated_amount,
    calculated_price: convertToLocale({
      amount: variant.calculated_price.calculated_amount,
      currency_code: variant.calculated_price.currency_code,
    }),
    original_price_number: variant.calculated_price.original_amount,
    original_price: convertToLocale({
      amount: variant.calculated_price.original_amount,
      currency_code: variant.calculated_price.currency_code,
    }),
    currency_code: variant.calculated_price.currency_code,
    price_type: variant.calculated_price.calculated_price.price_list_type,
    percentage_diff: getPercentageDiff(
      variant.calculated_price.original_amount,
      variant.calculated_price.calculated_amount
    ),
  }
}

export function getBundlePrice({
  bundle,
}: {
 bundle: BundleProduct
}) {
  if (!bundle || !bundle.id) {
    throw new Error("No product provided")
  }

  const cheapestPrice = () => {
    if (!bundle) {
      return null
    }

    return getPricesForVariant(bundle)
  }

  const variantPrice = () => {
    if (!bundle) {
      return null
    }

    return getPricesForVariant(variantPrice)
  }

  return {
    bundle,
    cheapestPrice: cheapestPrice(),
  }
}
