import { MedusaError } from "@medusajs/framework/utils";
import { addToCartWorkflow } from "@medusajs/medusa/core-flows";

addToCartWorkflow.hooks.validate(
    async ({ input}, {container}) =>{
        const query = container.resolve("query");
        const { data: variants } = await query.graph({
            entity: "variant",
            fields: ["product.*"],
            filters: {
                id: input.items.map((item) =>item.variant_id).filter(Boolean) as string[],
            },
        })
        for (const item of input.items)
        {
            const variant = variants.find((v) => v.id === item.variant_id);
            if(!variant?.product?.metadata?.is_personalized)
            {
                continue
            }
            const heightValue = Number(item.metadata?.height);
            const widthValue = Number(item.metadata?.width);
            if(!item.metadata?.height || !item.metadata.width || isNaN(Number(heightValue)) || isNaN(Number(widthValue))) 
            {
                throw new MedusaError(MedusaError.Types.INVALID_DATA, "Please set height and width metadata for each item.")
            }
            const maxHeightValue = Number(variant.product?.metadata?.max_height)
            const maxWidthValue = Number(variant.product?.metadata?.max_width)
            if (!isNaN(maxHeightValue) && heightValue > maxHeightValue)
            {
                throw new MedusaError(MedusaError.Types.INVALID_DATA, "Height exceeds the maximum allowed height for this product.")
            }
            if (!isNaN(maxWidthValue) && widthValue > maxWidthValue)
            {
                throw new MedusaError(MedusaError.Types.INVALID_DATA, "Width exceeds the maximum allowed width for this product.")
            }
        }
    }
)