import { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { getCustomPriceWorkflow } from "../../../../../workflows/get-custom-price";
import { z } from "zod";
import { Modules } from "@medusajs/framework/utils";


export const PostCustomPriceSchema = z.object({
    region_id: z.string(),
    country_code: z.string().length(2).optional(),
    product_id: z.string().optional(),
    /** Menge – für GPE-Staffelpreise. Ohne Angabe rechnet GPE mit 1. */
    quantity: z.number().int().positive().optional(),
    metadata: z.object({
        // Bei GPE-Produkten optional: nicht jedes Produkt hat freie Maße.
        // Für den lokalen Pfad prüft der Step weiterhin auf Vorhandensein.
        height: z.number().optional(),
        width: z.number().optional(),
        /** GPE: gewählte Optionswerte. Ohne diese Zeile würde zod sie verwerfen. */
        gpe_option_values: z.array(z.unknown()).optional(),
        /** GPE: freie Zusatzfelder jenseits von width/height. */
        gpe_additional_fields: z.record(z.unknown()).optional(),
    }).optional(),
})


type PostCustomPriceSchemaType = z.infer<typeof PostCustomPriceSchema>


export async function POST(req: MedusaStoreRequest<PostCustomPriceSchemaType>,res: MedusaResponse) 
{

  const { id: variantId } = req.params;

  const { region_id, metadata, quantity, country_code, product_id } = req.validatedBody;

  // Angemeldeten Kunden aus dem Auth-Kontext ziehen. Das authenticate-Middleware
  // (siehe api/middlewares.ts) füllt req.auth_context, sobald ein Kunde per
  // Session oder Bearer-Token angemeldet ist. Bei GPE-Produkten hängt der Rabatt
  // am Kunden – so zeigt die Vorschau denselben Preis wie später der Warenkorb.
  // Gast (nicht angemeldet) → auth_context fehlt → null → GPE rechnet ohne
  // Kundenrabatt (RECIPE 6a).
  const customer_id = req.auth_context?.actor_id ?? null

  const { result: price } = await getCustomPriceWorkflow(req.scope).run({

    input: {
        variant_id: variantId,
        region_id,
        metadata,
        quantity,
        customer_id,
    },
  })

  // Bruttopreis ausschließlich für die Anzeige. Der Nettopreis oben geht
  // unverändert in den Warenkorb (siehe custom-add-to-cart) – dort darf keine
  // Steuer enthalten sein, sonst rechnet Medusa sie ein zweites Mal drauf.
  let tax_rate = 0
  let price_with_tax = price

  if (country_code && product_id) {
    const taxService = req.scope.resolve(Modules.TAX)
    const taxLines = await taxService.getTaxLines(
      [{ id: variantId, product_id, unit_price: price, quantity: 1 }],
      { address: { country_code } }
    )
    tax_rate = taxLines[0]?.rate ?? 0
    price_with_tax = Math.round(price * (1 + tax_rate / 100) * 100) / 100
  }



  res.json({ price, price_with_tax, tax_rate })
}