import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  const str = (k: string) => (typeof md?.[k] === "string" ? (md[k] as string) : null);

  res.json({
    legal: {
      imprint_company: str("imprint_company"),
      imprint_address: str("imprint_address"),
      imprint_represented_by: str("imprint_represented_by"),
      imprint_phone: str("imprint_phone"),
      imprint_email: str("imprint_email"),
      imprint_register: str("imprint_register"),
      imprint_vat_id: str("imprint_vat_id"),
      imprint_extra: str("imprint_extra"),
    },
    texts: (md as any)?.legal_texts ?? {},
  })
}
