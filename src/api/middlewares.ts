import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import { PostBundledProductsSchema } from "./admin/bundled-products/route";
import { validateAndTransformQuery } from "@medusajs/framework/http";
import { createFindParams } from "@medusajs/medusa/api/utils/validators";
import { PostCartsBundledLineItemsSchema} from "./store/carts/[id]/line-item-bundles/route";
import { PostCustomPriceSchema } from "./store/variants/[id]/price/route";
import { PostAddCustomLineItemSchema } from "./store/carts/[id]/line-items-custom/route";
import { authenticate } from "@medusajs/framework/http";
import { protectCustomerMetadata } from "../lib/protect-customer-metadata";



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
        // allowUnauthenticated: Gäste dürfen die Vorschau weiter sehen (dann
        // ohne Rabatt). Ist ein Kunde angemeldet, füllt authenticate
        // req.auth_context, damit die Route seine customer_id an GPE
        // durchreichen kann – Vorschau = Warenkorbpreis (RECIPE 6a).
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
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
      {
      // Rechnungen sind nur für angemeldete Kunden. Ohne
      // allowUnauthenticated antwortet Medusa Gästen selbst mit 401 –
      // die Route wird gar nicht erst aufgerufen.
      matcher: "/store/orders/:id/invoices",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/invoices/:id/pdf",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // Kunden dürfen ihre Metadaten ändern (z. B. Designs), aber nicht die
      // Verknüpfung mit GPE. Siehe src/lib/protect-customer-metadata.ts.
      matcher: "/store/customers/me",
      methods: ["POST"],
      middlewares: [protectCustomerMetadata],
    },
    {
      // Registrierung: Ein neuer Kunde darf sich nichts Geschütztes mitgeben.
      matcher: "/store/customers",
      methods: ["POST"],
      middlewares: [protectCustomerMetadata],
    },

  ],
})