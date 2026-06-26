import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

type BankSettings = {
  bank_account_holder: string | null
  bank_name: string | null
  bank_iban: string | null
  bank_bic: string | null
  bank_note: string | null
}

type BankSettingsResponse = { bank_settings: BankSettings };

const normalize = (v: unknown) => {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length ? s : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse<BankSettingsResponse>) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  res.json({
    bank_settings: {
      bank_account_holder: typeof md?.bank_account_holder === "string" ? md.bank_account_holder : null,
      bank_name: typeof md?.bank_name === "string" ? md.bank_name : null,
      bank_iban: typeof md?.bank_iban === "string" ? md.bank_iban : null,
      bank_bic: typeof md?.bank_bic === "string" ? md.bank_bic : null,
      bank_note: typeof md?.bank_note === "string" ? md.bank_note : null,
    },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse<BankSettingsResponse | { message: string }>) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) 
{
    res.status(400).json({ message: "No store found" })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const bank_account_holder = normalize(body.bank_account_holder);
  const bank_name = normalize(body.bank_name);
  const bank_iban = normalize(body.bank_iban);
  const bank_bic = normalize(body.bank_bic);
  const bank_note = normalize(body.bank_note);

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  const metadata = {
    ...prev,
    bank_account_holder,
    bank_name,
    bank_iban,
    bank_bic,
    bank_note,
  };

  await storeModuleService.updateStores({ id: store.id }, { metadata });

  res.json({
    bank_settings: { bank_account_holder, bank_name, bank_iban, bank_bic, bank_note },
  })
}
