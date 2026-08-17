import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  const str = (k: string) => (typeof md?.[k] === "string" ? (md[k] as string) : null)

  res.json({
    theme: {
      theme_surface_bg: str("theme_surface_bg"),
      theme_border: str("theme_border"),
      theme_primary: str("theme_primary"),
      theme_primary_hover: str("theme_primary_hover"),
      theme_button_text: str("theme_button_text"),
      theme_header_bg: str("theme_header_bg"),
      theme_hero_bg: str("theme_hero_bg"),
      theme_page_bg: str("theme_page_bg"),
      theme_page_text: str("theme_page_text"),
      theme_footer_bg: str("theme_footer_bg"),
      theme_logo_url: str("theme_logo_url"),
      theme_hero_url: str("theme_hero_url"),
      theme_hover_bg: str("theme_hover_bg"),
      theme_font: str("theme_font")
    },
  })
}
