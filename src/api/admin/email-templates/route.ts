import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { SPRACHEN, VORLAGEN, standardVorlage, type Vorlage } from "../../../lib/email-templates";

/** Felder, die im Admin bearbeitet werden dürfen. */
const FELDER: Record<Vorlage, string[]> = {
  password_reset: ["subject", "default_from_name", "text"],
  order_confirmation: ["subject", "default_from_name", "text", "prepayment_section"],
  production_status_update: ["subject", "default_from_name", "text"],
}

export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  // Die Vorgaben mitschicken, damit das Formular sie als Platzhalter zeigen kann.
  const vorgaben: Record<string, any> = {};
  for (const sprache of SPRACHEN) 
{
    vorgaben[sprache] = {};
    for (const name of VORLAGEN) 
    {
      vorgaben[sprache][name] = standardVorlage(sprache, name);
    }
  }

  res.json({
    custom: (md as any)?.email_templates_custom ?? {},
    defaults: vorgaben,
    felder: FELDER,
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) 
    {
    res.status(400).json({ message: "No store found" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, any>;
  const eingang = body.custom ?? {};
  const sauber: Record<string, any> = {};

  // Nur bekannte Sprachen, Vorlagen und Felder übernehmen – und nur solche
  // mit Inhalt. Leere Felder werden gar nicht erst gespeichert, damit sie
  // beim Versand auf die mitgelieferte Vorlage zurückfallen.
  for (const sprache of SPRACHEN) 
{
    const proSprache = eingang?.[sprache];
    if (!proSprache || typeof proSprache !== "object") continue;

    for (const name of VORLAGEN) 
    {
      const proVorlage = proSprache?.[name];
      if (!proVorlage || typeof proVorlage !== "object") continue;

      for (const feld of FELDER[name]) 
    {
        const wert = proVorlage[feld];
        if (typeof wert !== "string" || !wert.trim()) continue;

        sauber[sprache] ??= {};
        sauber[sprache][name] ??= {};
        sauber[sprache][name][feld] = wert;
      }
    }
  }

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  await storeModuleService.updateStores(
    { id: store.id },
    { metadata: { ...prev, email_templates_custom: sauber } }
  )

  res.json({ custom: sauber });
}
