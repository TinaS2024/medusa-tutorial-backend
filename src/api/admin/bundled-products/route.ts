import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "zod";
import { AdminCreateProduct } from "@medusajs/medusa/api/admin/products/validators";
import { createBundledProductWorkflow, CreateBundledProductWorkflowInput } from "../../../workflows/create-bundled-product";



export const PostBundledProductsSchema = z.object({

  title: z.string().min(1, "Title is required and cannot be empty."),
  product: AdminCreateProduct(),
  items: z.array(z.object({
    product_id: z.string().min(1, "Product ID is required."),
    quantity: z.number().min(1, "Quantity must be at least 1."),

  })),

})


type PostBundledProductsSchema = z.infer<typeof PostBundledProductsSchema>


export async function POST(req: AuthenticatedMedusaRequest<PostBundledProductsSchema>,res: MedusaResponse) 
{

  try{
    console.log("DEBUG Backend: Received Payload:", JSON.stringify(req.validatedBody, null, 2));
    
    const { result: bundledProduct } = await createBundledProductWorkflow(req.scope)
      .run({ input: {
          bundle: req.validatedBody
          } as CreateBundledProductWorkflowInput,
      });


      res.json({bundled_product: bundledProduct});
  }catch(error){
    console.error("Backend Error during bundled product creation:", error);

    if (error && typeof error === "object" && "message" in error)
    {
      return res.status(500).json({message: `Failed to create bundled product: ${error.message}`});
    }

  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse ) 
{
  const query = req.scope.resolve("query")
  const { 
    data: bundledProducts, 
    metadata: { count, take, skip } = {}, 

    } = await query.graph({

    entity: "bundle",
    ...req.queryConfig,
  })


  res.json({
    bundled_products: bundledProducts,
    count: count || 0,
    limit: take || 15,
    offset: skip || 0,
  })
}