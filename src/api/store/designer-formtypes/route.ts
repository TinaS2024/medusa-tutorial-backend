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
}

export async function GET(req: MedusaRequest, res: MedusaResponse<DesignerFormType[]>) 
{
  const query = req.scope.resolve("query");

  const { data: products } = await query.graph({
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
    ]
  });


  const formTypes: DesignerFormType[] = [];

  for (const product of products as any[]) 
    {
    const title: string = product.title || "";
    const subtitle: string = product.subtitle || "";
    const metadata = (product.metadata as any) || {};
    
    if (!metadata.is_designable) 
    {
      continue;
    }

    const titleLower = title.toLowerCase();
    const subtitleLower = subtitle.toLowerCase();

    let kind = "other";
    if (titleLower.includes("prägestempel") || subtitleLower.includes("prägestempel")) 
    {
      kind = "emboss";
    } else if (titleLower.includes("schild") || subtitleLower.includes("schild")) {
      kind = "shield";
    } else if (titleLower.includes("trodat") || subtitleLower.includes("trodat") || titleLower.includes("stempel") || subtitleLower.includes("stempel")) 
    {
      kind = "stamp";
    }

    const productWidth = Number(product.width) || 0;
    const productHeight = Number(product.height) || 0;

    const options: any[] = Array.isArray(product.options) ? product.options : [];
    const widthOption = options.find((opt) => opt.title === "Breite");
    const heightOption = options.find((opt) => opt.title === "Höhe");

    const hasCushion = options.some((opt) => opt.title === "Kissenfarbe");
    const hasEmboss = options.some((opt) => opt.title === "Prägeposition");

    let baseMaterial = "";

    if (typeof (product as any).material === "string") 
    {
      baseMaterial = (product as any).material;
    } else if (typeof metadata.material === "string") 
    {
      baseMaterial = metadata.material;
    }

    const variants: any[] = Array.isArray(product.variants) ? product.variants : [];

    for (const variant of variants) 
    {
      let width = productWidth;
      let height = productHeight;

      const variantOptions: any[] = Array.isArray(variant.options) ? variant.options : [];

      if (widthOption) 
    {
        const vWidthOpt = variantOptions.find((vo) => vo.option_id === widthOption.id);
        if (vWidthOpt && vWidthOpt.value != null && !isNaN(Number(vWidthOpt.value))) 
        {
          width = Number(vWidthOpt.value);
        }
      }

      if (heightOption) 
    {
        const vHeightOpt = variantOptions.find((vo) => vo.option_id === heightOption.id);
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
      });
    }
  }

  res.json(formTypes);
}