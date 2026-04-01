import { ProductVariantDTO } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";


export type GetCustomPriceStepInput = {
  variant: ProductVariantDTO & {
    calculated_price?: {
      calculated_amount: number
    }
  }
  metadata?: Record<string, unknown>
}

const DEFAULT_DIMENSION_PRICE_FACTOR = 0.01;

export const getCustomPriceStep = createStep("get-custom-price",

  async ({ variant, metadata = {}, }: GetCustomPriceStepInput) => 
    {

    if (!variant.product?.metadata?.is_personalized) 
    {
      return new StepResponse(variant.calculated_price?.calculated_amount || 0)
    }

    const height = Number(metadata.height)
    const width = Number(metadata.width)

    if (!metadata.height || !metadata.width || isNaN(height) || isNaN(width)) 
    {
      throw new MedusaError(MedusaError.Types.INVALID_DATA,"Custom price requires width and height metadata to be set.")
    }

    const maxHeight = Number(variant.product?.metadata?.max_height)
    const maxWidth = Number(variant.product?.metadata?.max_width)

    if (!isNaN(maxHeight) && height > maxHeight)
    {
      throw new MedusaError(MedusaError.Types.INVALID_DATA,"Height exceeds the maximum allowed height for this product.")
    }

    if (!isNaN(maxWidth) && width > maxWidth)
    {
      throw new MedusaError(MedusaError.Types.INVALID_DATA,"Width exceeds the maximum allowed width for this product.")
    }

    const rawFactor = (variant.product?.metadata as any)?.dimension_price_factor;
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