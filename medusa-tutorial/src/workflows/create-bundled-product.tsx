import { CreateProductWorkflowInputDTO } from "@medusajs/framework/types";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createBundleStep } from "./steps/create-bundle";
import { createBundleItemsStep } from "./steps/create-bundle-items";
import { createProductsWorkflow, createRemoteLinkStep} from "@medusajs/medusa/core-flows";
import { BUNDLED_PRODUCT_MODULE } from "../modules/bundled-product";
import { Modules } from "@medusajs/framework/utils";



export type CreateBundledProductWorkflowInput = {
    bundle: { 
        title: string
        product: CreateProductWorkflowInputDTO
            items: {
                product_id: string
                quantity: number
                }[]
            }
}

export const createBundledProductWorkflow = createWorkflow("create-bundled-product",

  ({ bundle: bundleData }: CreateBundledProductWorkflowInput) => {

    const bundle = createBundleStep({ title: bundleData.title, })
    const bundleItems = createBundleItemsStep({ bundle_id: bundle.id, items: bundleData.items, })
    const bundleProduct = createProductsWorkflow.runAsStep({
        input: 
        { 
            products: [bundleData.product], 
        }, 
    })


    createRemoteLinkStep([{ 
        [BUNDLED_PRODUCT_MODULE]: 
        {
            bundle_id: bundle.id,
        },

        [Modules.PRODUCT]: 
        {
            product_id: bundleProduct[0].id,
        },

        }])


    const bundleProductitemLinks = transform({
        originalBundeItemsInput: bundleData.items,
        createBundleItems: bundleItems,
        }, (data) => {

        return data.createBundleItems.map((createdItem, index) => ({
        [BUNDLED_PRODUCT_MODULE]: 
        {
          bundle_item_id: createdItem.id,
        },

        [Modules.PRODUCT]: 
        {
          product_id: data.originalBundeItemsInput[index].product_id,
        },

      }))

    })

    createRemoteLinkStep(bundleProductitemLinks).config({ name: "create-bundle-product-items-links", 

    })


    const finalBundleResponseData = transform({
            bundleId: bundle.id,
            bundleTitle: bundle.title,
            createdBundleItems: bundleItems,
            originalBundleItems: bundleData.items, 
            createdProduct: bundleProduct[0]
        }, (data) => {
            const itemsWithProductId = data.createdBundleItems.map((item, index) => ({
                id: item.id,
                bundle_id: item.bundle_id,
                quantity: item.quantity,
                product_id: data.originalBundleItems[index].product_id,
            }));

            return {
                id: data.bundleId,
                title: data.bundleTitle,
                items: itemsWithProductId,
                product: data.createdProduct
            };
        });


        return new WorkflowResponse(finalBundleResponseData);

  }

)
