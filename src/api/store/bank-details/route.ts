import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  res.json({
    bank_details: {
      bank_account_holder: typeof md?.bank_account_holder === "string" ? md.bank_account_holder : null,
      bank_name: typeof md?.bank_name === "string" ? md.bank_name : null,
      bank_iban: typeof md?.bank_iban === "string" ? md.bank_iban : null,
      bank_bic: typeof md?.bank_bic === "string" ? md.bank_bic : null,
      bank_note: typeof md?.bank_note === "string" ? md.bank_note : null,
    },
  });
}
