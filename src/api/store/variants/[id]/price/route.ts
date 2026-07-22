import { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { getCustomPriceWorkflow } from "../../../../../workflows/get-custom-price";
import { z } from "zod";


export const PostCustomPriceSchema = z.object({
    region_id: z.string(),
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

  const { region_id, metadata, quantity } = req.validatedBody;

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


  res.json({ price })
}