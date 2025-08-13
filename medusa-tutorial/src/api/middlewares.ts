import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import { PostBundledProductsSchema } from "./admin/bundled-products/route";
import { validateAndTransformQuery } from "@medusajs/framework/http";
import { createFindParams } from "@medusajs/medusa/api/utils/validators";
import { PostCartsBundledLineItemsSchema} from "./store/carts/[id]/line-item-bundles/route";
import { PostCustomPriceSchema } from "./store/variants/[id]/price/route";
import { PostAddCustomLineItemSchema } from "./store/carts/[id]/line-items-custom/route";


export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/bundled-products",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostBundledProductsSchema),
      ],
    },
    {
      matcher: "/admin/bundled-products",
      methods: ["GET"],
      middlewares: [
        validateAndTransformQuery(createFindParams(),{
          defaults: [
            "id",
            "title",
            "product.*",
            "items.*",
            "items.product.*",
          ],
          isList: true,
          defaultLimit:15,
        })
      ]
    },
    {
      matcher: "/store/carts/:id/line-item-bundles",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostCartsBundledLineItemsSchema),
      ],
    },
    {
      matcher: "/store/variants/:id/price",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostCustomPriceSchema),
      ]
    },
    {
      matcher: "/store/carts/:id/line-items-custom",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostAddCustomLineItemSchema),
      ],
    },
  ],
})