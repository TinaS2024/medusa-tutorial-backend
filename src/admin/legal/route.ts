import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

const FELDER = [
  "imprint_company",
  "imprint_address",
  "imprint_represented_by",
  "imprint_phone",
  "imprint_email",
  "imprint_register",
  "imprint_vat_id",
  "imprint_extra",
] as const;

const text = (v: unknown) => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  const legal: Record<string, string | null> = {};
  for (const feld of FELDER) 
{
    legal[feld] = typeof md?.[feld] === "string" ? (md[feld] as string) : null;
  }

  res.json({ legal });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) 
{
    res.status(400).json({ message: "No store found" })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const werte: Record<string, string | null> = {}

  for (const feld of FELDER) 
{
    werte[feld] = text(body[feld]);
  }

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  await storeModuleService.updateStores({ id: store.id }, { metadata: { ...prev, ...werte } });

  res.json({ legal: werte });
}
