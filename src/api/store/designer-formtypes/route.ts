import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

type DesignerFormType = {
  name: string,
  kind: string,
  width: number,
  height: number,
  medusa_product_id: string,
  medusa_variant_id: string,
  product_title: string,
  variant_title: string,
  material: string,
  has_cushion: boolean,
  has_emboss: boolean,
  cushion_color_option: string,
}
const firstString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const v0 = value[0];
    if (typeof v0 === "string" && v0.trim()) return v0;
  }
  return undefined;
};

const normalizeLocale = (locale?: string): "de-DE" | "en-GB" | "fr-FR" | "nl-NL" => {

  const raw = String(locale || "").trim();
  const first = raw.split(",")[0]?.trim() || "";
  const l = first.toLowerCase();

  if (l.startsWith("de")) return "de-DE";
  if (l.startsWith("en")) return "en-GB";
  if (l.startsWith("fr")) return "fr-FR";
  if (l.startsWith("nl")) return "nl-NL";
  return "de-DE";
};

const getRequestedLocale = (req: MedusaRequest): "de-DE" | "en-GB" | "fr-FR" | "nl-NL" => {
  const candidate =
    firstString((req as any).locale) ||
    firstString((req.query as any)?.locale) ||
    firstString((req.headers as any)?.["x-medusa-locale"]) ||
    firstString((req.headers as any)?.["accept-language"]) ||
    "de-DE";

  return normalizeLocale(candidate);
};

const includesAny = (haystack: string, needles: string[]): boolean => {
  return needles.some((n) => haystack.includes(n));
};

export async function GET(req: MedusaRequest, res: MedusaResponse<DesignerFormType[]>) 
{
  const query = req.scope.resolve("query");

  const requestedLocale = getRequestedLocale(req);

  const queryConfig = {
    entity: "product",
    fields: [
      "id",
      "title",
      "subtitle",
      "metadata",
      "width",
      "height",
      "options.*",
      "variants.*",
      "variants.options.*",
    ],
  };

  const { data: baseData } = await query.graph(queryConfig as any);
  const baseProducts = (baseData as any[]) || [];

  let localizedProducts = baseProducts;

  try {
    const { data } = await query.graph(queryConfig as any, {
      locale: requestedLocale,
    } as any);
    localizedProducts = (data as any[]) || baseProducts;
  } catch {
    localizedProducts = baseProducts;
  }

   const embossKeywords = [
    "prägestempel",
    "praegestempel",
    "emboss",
    "embosser",
    "gaufrage",
    "timbre à sec",
    "timbre a sec",
    "blinddruk",
    "blinddrukstempel",
    "droogstempel",
    "preegstempel",
    "blind emboss",
  ];

  const shieldKeywords = ["schild", "shield", "plaque", "naambord", "naamplaat", "plaat"];

  const stampKeywords = [
    "trodat",
    "stempel",
    "stamp",
    "tampon",
    "holzstempel",
    "houtstempel",
    "bois",
    "hout",
  ];

  const widthTitles = ["breite", "width", "largeur", "breedte"];
  const heightTitles = ["höhe", "hoehe", "height", "hauteur", "hoogte"];
  const cushionTitles = ["kissenfarbe", "cushion", "coussin", "kussen", "encre", "ink"];
  const embossTitles = ["prägeposition", "praegeposition", "emboss", "gaufrage", "blinddruk", "position"];

  const isTitleMatch = (opt: any, titles: string[]) => {
    const t = String(opt?.title || "").toLowerCase();
    return titles.some((x) => t === x || t.includes(x));
  };

  const baseById = new Map<
    string,
    {
      kind: string;
      widthOptionId?: string;
      heightOptionId?: string;
      cushionOptionId?: string;
      hasEmboss: boolean;
      baseMaterial: string;
      productWidth: number;
      productHeight: number;
    }
  >();

  for (const baseProduct of baseProducts as any[])
  {
    const baseTitle: string = baseProduct?.title || "";
    const baseSubtitle: string = baseProduct?.subtitle || "";

    const titleLower = baseTitle.toLowerCase();
    const subtitleLower = baseSubtitle.toLowerCase();

    let kind = "other";
    if (includesAny(titleLower, embossKeywords) || includesAny(subtitleLower, embossKeywords))
    {
      kind = "emboss";
    } else if (includesAny(titleLower, shieldKeywords) || includesAny(subtitleLower, shieldKeywords))
    {
      kind = "shield";
    } else if (includesAny(titleLower, stampKeywords) || includesAny(subtitleLower, stampKeywords))
    {
      kind = "stamp";
    }

    const baseMetadata = (baseProduct?.metadata as any) || {};

    let baseMaterial = "";
    if (typeof (baseProduct as any)?.material === "string")
    {
      baseMaterial = (baseProduct as any).material;
    } else if (typeof baseMetadata.material === "string")
    {
      baseMaterial = baseMetadata.material;
    }

    const baseOptions: any[] = Array.isArray(baseProduct?.options) ? baseProduct.options : [];
    const widthOption = baseOptions.find((opt) => isTitleMatch(opt, widthTitles));
    const heightOption = baseOptions.find((opt) => isTitleMatch(opt, heightTitles));
    const cushionOption = baseOptions.find((opt) => isTitleMatch(opt, cushionTitles));
    const hasEmboss = baseOptions.some((opt) => isTitleMatch(opt, embossTitles));

    baseById.set(String(baseProduct.id), {
      kind,
      widthOptionId: widthOption?.id,
      heightOptionId: heightOption?.id,
      cushionOptionId: cushionOption?.id,
      hasEmboss,
      baseMaterial,
      productWidth: Number(baseProduct?.width) || 0,
      productHeight: Number(baseProduct?.height) || 0,
    });
  }

  const formTypes: DesignerFormType[] = [];

  for (const product of localizedProducts as any[]) 
    {
    const title: string = product.title || "";
    const subtitle: string = product.subtitle || "";
    const metadata = (product.metadata as any) || {};
    
    if (!metadata.is_designable) 
    {
      continue;
    }

    const baseInfo = baseById.get(String(product.id));

    const kind = baseInfo?.kind || "other";

    const productWidth = baseInfo?.productWidth ?? (Number(product.width) || 0);
    const productHeight = baseInfo?.productHeight ?? (Number(product.height) || 0);

    const widthOptionId = baseInfo?.widthOptionId;
    const heightOptionId = baseInfo?.heightOptionId;
    const cushionOptionId = baseInfo?.cushionOptionId;

    const hasCushion = Boolean(cushionOptionId);
    const hasEmboss = baseInfo?.hasEmboss ?? false;

    let baseMaterial = baseInfo?.baseMaterial || "";

    const variants: any[] = Array.isArray(product.variants) ? product.variants : [];

    for (const variant of variants) 
    {
      let width = productWidth;
      let height = productHeight;

      const variantOptions: any[] = Array.isArray(variant.options) ? variant.options : [];

    if (widthOptionId) 
    {
        const vWidthOpt = variantOptions.find((vo) => vo.option_id === widthOptionId);
        if (vWidthOpt && vWidthOpt.value != null && !isNaN(Number(vWidthOpt.value))) 
        {
          width = Number(vWidthOpt.value);
        }
      }

    if (heightOptionId) 
    {
        const vHeightOpt = variantOptions.find((vo) => vo.option_id === heightOptionId);
        if (vHeightOpt && vHeightOpt.value != null && !isNaN(Number(vHeightOpt.value))) 
        {
          height = Number(vHeightOpt.value);
        }
      }

    if (!width || !height) 
    {
        continue;
      }

      const nameParts: string[] = [];
      if (title) {
        nameParts.push(title);
      }
      if (variant.title) {
        nameParts.push(variant.title);
      }
      nameParts.push(`${width}x${height}`);

      let cushionColorOption = "";
      if (hasCushion && cushionOptionId) 
      {
        const variantOptions: any[] = Array.isArray(variant.options) ? variant.options : [];
        const vCushionOpt = variantOptions.find(
          (vo) => vo.option_id === cushionOptionId
        );
        if (vCushionOpt && vCushionOpt.value != null) 
        {
          cushionColorOption = String(vCushionOpt.value);
        }
      }

      const name = nameParts.join(" - ");

      let material = baseMaterial;
      if (!material) 
      {
        if (kind === "shield") 
        {
          material = "Alu";
        } else {
          material = "Gummi";
        }
      }

      formTypes.push({
        name,
        kind,
        width,
        height,
        medusa_product_id: product.id,
        medusa_variant_id: variant.id,
        product_title: title,
        variant_title: variant.title || "",
        material, 
        has_cushion: hasCushion,
        has_emboss: hasEmboss, 
        cushion_color_option: cushionColorOption,
      });
    }
  }

  res.json(formTypes);
}