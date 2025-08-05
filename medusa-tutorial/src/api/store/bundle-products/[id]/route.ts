import { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { QueryContext } from "@medusajs/framework/utils";
import BundledProductModuleService from "../../../../modules/bundled-product/service";
import { ICacheService } from "@medusajs/framework/types";


export async function GET(req: MedusaRequest,res: MedusaResponse) 
{
    const { id } = req.params;
    const query = req.scope.resolve("query");
    const { currency_code, region_id } = req.query;
    
    const { data } = await query.graph({
        entity: "bundle",
        fields: [
            "*", 
            "items.*", 
            "items.product.*", 
            "items.product.options.*",
            "items.product.options.values.*",
            "items.product.variants.*",
            "items.product.variants.calculated_price.*",
            "items.product.variants.options.*",
        ],
        filters: {
            id,
            },
        context: {
            items: {
                product: {
                    variants: {
                        calculated_price: QueryContext({
                            region_id,
                            currency_code,
                            }),
                            },
                        },
                    },
                },
  }, { throwIfKeyNotFound: true, })


  res.json({ bundle_product: data[0],})

}

export async function DELETE(req: AuthenticatedMedusaRequest,res: MedusaResponse)
{
    try{
        const {id} = req.params;
        const bundleService: BundledProductModuleService = req.scope.resolve("bundleService");
        const cacheService: ICacheService = req.scope.resolve("cacheService");

        await bundleService.deleteBundleItems(id);
        await cacheService.invalidate("bundled-products");

        res.json({id, deleted: true});
    }catch (error){
        console.error("Backend Error during bundle deletion:", error);
        return res.status(500).json({message:`Failed to delete bundled product: ${error.message}`});
    }
}