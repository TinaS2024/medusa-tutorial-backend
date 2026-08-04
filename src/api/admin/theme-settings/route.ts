import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { revalidateStorefront } from "../../../lib/revalidate-storefront";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

type ThemeSettings = {
  theme_primary: string | null
  theme_primary_hover: string | null
  theme_button_text: string | null
  theme_header_bg: string | null
  theme_footer_bg: string | null
  theme_logo_url: string | null
  theme_hero_url: string | null
}

const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

// erlaubt absolute URLs (Upload) und projekteigene Pfade wie /Hero.png
const normalizeUrl = (v: unknown) => {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s.length) return null
  if (s.startsWith("/") || /^https?:\/\//i.test(s)) return s
  return undefined   // ungültig
}

const normalizeColor = (v: unknown) => {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s.length) return null
  return isHex(s) ? s : undefined   // undefined = ungültig
}

const read = (md: Record<string, unknown> | null, key: keyof ThemeSettings) =>
  typeof md?.[key] === "string" ? (md[key] as string) : null

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  res.json({
    theme_settings: {
      theme_primary: read(md, "theme_primary"),
      theme_primary_hover: read(md, "theme_primary_hover"),
      theme_button_text: read(md, "theme_button_text"),
      theme_header_bg: read(md, "theme_header_bg"),
      theme_footer_bg: read(md, "theme_footer_bg"),
      theme_logo_url: read(md, "theme_logo_url"),
      theme_hero_url: read(md, "theme_hero_url"),
    },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) {
    res.status(400).json({ message: "No store found" })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const colorKeys: (keyof ThemeSettings)[] = [
    "theme_primary",
    "theme_primary_hover",
    "theme_button_text",
    "theme_header_bg",
    "theme_footer_bg",
  ]
  const urlKeys: (keyof ThemeSettings)[] = ["theme_logo_url", "theme_hero_url"]

  const values: Record<string, string | null> = {}

  for (const key of colorKeys) 
  {
    const v = normalizeColor(body[key])
    if (v === undefined) {
      res.status(400).json({ message: `Ungültiger Farbwert für ${key} (erwartet #RRGGBB)` })
      return
    }
    values[key] = v
  }

  for (const key of urlKeys) 
  {
    const v = normalizeUrl(body[key])
    if (v === undefined) {
      res.status(400).json({ message: `Ungültige Bild-Adresse für ${key}` })
      return
    }
    values[key] = v
  }

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
  await storeModuleService.updateStores(
    { id: store.id },
    { metadata: { ...prev, ...values } }
  )

  const revalidated = await revalidateStorefront(["theme"])
  if (!revalidated.ok) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(`[theme] Storefront-Cache nicht invalidiert: ${revalidated.reason}`)
  }

  res.json({ theme_settings: values, revalidated: revalidated.ok })

}
