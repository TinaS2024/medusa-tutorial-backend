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
  "cookie_banner_enabled",
  "cookie_baner_text"
] as const;

const SPRACHEN = ["de", "en", "fr", "nl"] as const;
const DOKUMENTE = ["terms", "privacy", "withdrawal", "shipping"] as const;

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

  res.json({ legal, texts: (md as any)?.legal_texts ?? {}, });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) {
    res.status(400).json({ message: "No store found" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const werte: Record<string, string | null> = {}

  for (const feld of FELDER) 
{
    werte[feld] = text(body[feld]);
  }

  // Rechtstexte je Sprache. Leere Einträge werden nicht gespeichert, damit
  // sie im Shop auf die deutsche Fassung zurückfallen.
  const eingang = (body.texts ?? {}) as Record<string, any>
  const texte: Record<string, any> = {}

  for (const sprache of SPRACHEN) 
  {
    for (const dok of DOKUMENTE) 
    {
      const wert = eingang?.[sprache]?.[dok];
      if (typeof wert !== "string" || !wert.trim()) continue;

      texte[sprache] ??= {};
      texte[sprache][dok] = wert;
    }
  }

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
    await storeModuleService.updateStores(
    { id: store.id },
    { metadata: { ...prev, ...werte, legal_texts: texte } }
  )

  res.json({ legal: werte, texts: texte })
}
