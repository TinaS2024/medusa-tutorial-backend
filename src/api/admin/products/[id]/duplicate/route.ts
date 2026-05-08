import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";

type PostDuplicateProductBody = {
  title?: string
  title_suffix?: string
  handle?: string
  handle_suffix?: string
  status?: string
  copy_images?: boolean
  copy_categories?: boolean
  copy_metadata?: boolean
};

type DuplicateProductResponse = {
  product: {
    id: string
    title: string
    handle?: string
  }
  message?:string
};

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
};

const uniq = () => `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;


const getVariantPrices = (variant: any) => {
  const direct = Array.isArray(variant?.prices) ? variant.prices : undefined;
  const fromPriceSet = Array.isArray(variant?.price_set?.prices) ? variant.price_set.prices : undefined;

  const prices = direct ?? fromPriceSet;
  if (!prices) 
{
    return undefined;
  }

  const mapped = prices
    .map((p: any) => {
      const amount = p?.amount
      const currency_code = p?.currency_code
      if (typeof amount !== "number" || !currency_code) 
      {
        return null;
      }
      return { amount, currency_code };
    })
    .filter(Boolean)

  return mapped.length ? mapped : undefined;
}

export const POST = async (
  req: MedusaRequest<PostDuplicateProductBody>,
  res: MedusaResponse<DuplicateProductResponse>
) => {

    try{
        
    const productId = req.params.id;
    const query = req.scope.resolve("query");

    const body = req.body ?? {}; 
    
    const {
    title,
    title_suffix = " Copy",
    handle,
    handle_suffix = "-copy",
    status,
    copy_images = true,
    copy_categories = true,
    copy_metadata = true,
  } = body;

   const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "subtitle",
      "description",
      "handle",
      "status",
      "metadata",
      "weight",
      "length",
      "height",
      "width",
      "thumbnail",
      "shipping_profile_id",
      "sales_channels.*",
      "images.*",
      "options.*",
      "categories.*",
      "variants.*",
      "variants.options.*",
      "variants.prices.*",
      "variants.price_set.prices.*",
    ],
    filters: { id: [productId] },
  })

    const source = (data as any[])?.[0];

     if (!source) {
      res.status(404).json({
        product: { id: "", title: "" } as any,
        message: "Source product not found",
      })
      return
    }

    let shipping_profile_id = source.shipping_profile_id

    if (!shipping_profile_id) {
      const fulfillmentModuleService = req.scope.resolve(Modules.FULFILLMENT)

      const profiles = await fulfillmentModuleService.listShippingProfiles({})
      const defaultProfile = (profiles ?? []).find((p: any) => p?.type === "default")

      shipping_profile_id = defaultProfile?.id ?? profiles?.[0]?.id
    }

  if (!shipping_profile_id) 
    {
      res.status(400).json({
        product: { id: "", title: "" } as any,
        message: "No shipping profile found (source is missing shipping_profile_id and none exist)",
      })
      return
    }

  const salesChannels = Array.isArray(source.sales_channels)
      ? source.sales_channels
      : []

    const sales_channels = salesChannels
      .map((sc: any) => sc?.id)
      .filter(Boolean)
      .map((id: string) => ({ id }))

    if (!sales_channels.length) {
      res.status(400).json({
        product: { id: "", title: "" } as any,
        message: "Source product is missing sales_channels",
      })
      return
    }

    const sourceOptions: any[] = Array.isArray(source.options) ? source.options : [];
    const sourceVariants: any[] = Array.isArray(source.variants) ? source.variants : [];

    const optionTitleById = new Map(
    sourceOptions
      .map((o) => [o?.id, o?.title] as const)
      .filter((pair) => Boolean(pair[0] && pair[1]))
  )

  const valuesByOptionTitle = new Map<string, Set<string>>();

  for (const v of sourceVariants) 
   {
    const opts: any[] = Array.isArray(v?.options) ? v.options : [];
    for (const o of opts) 
    {
      const t = optionTitleById.get(o?.option_id);
      const value = o?.value;
      if (!t || value == null) continue;
      const set = valuesByOptionTitle.get(t) ?? new Set<string>();
      set.add(String(value));
      valuesByOptionTitle.set(t, set);
    }
  }

  const optionsInput = sourceOptions
    .map((o) => {
      const t = o?.title;
      if (!t) return null;
      const values = Array.from(valuesByOptionTitle.get(t) ?? []);
      return { title: t, values };
    })
    .filter(Boolean)

  const unique = uniq();

  const baseTitle = typeof source.title === "string" && source.title ? source.title : "Product";

  const baseHandle = typeof source.handle === "string" && source.handle ? slugify(source.handle) : slugify(baseTitle);

  const newTitle = typeof title === "string" && title.trim().length ? title.trim() : `${baseTitle}${title_suffix}`;

  const newHandle = typeof handle === "string" && handle.trim().length  ? slugify(handle.trim()) : slugify(`${baseHandle}${handle_suffix}-${unique}`);

  const imagesInput = copy_images ? (Array.isArray(source.images) ? source.images : [])
        .map((img: any) => img?.url)
        .filter(Boolean)
        .map((url: string) => ({ url }))
    : [];

  const categoriesInput = copy_categories ? (Array.isArray(source.categories) ? source.categories : [])
        .map((c: any) => c?.id)
        .filter(Boolean)
    : [];

  const variantsInput = sourceVariants.map((v) => {
    const opts: any[] = Array.isArray(v?.options) ? v.options : [];
    const options: Record<string, string> = {};

    for (const o of opts) 
    {
      const t = optionTitleById.get(o?.option_id);
      if (!t || o?.value == null) continue;
      options[t] = String(o.value);
    }

    const prices = getVariantPrices(v);

    const sku = typeof v?.sku === "string" && v.sku ? `${v.sku}-${unique}` : undefined;

    const out: any = {
      title: v?.title ?? Object.values(options).join(" / "),
      options,
    }

    if (sku) out.sku = sku;
    if (prices) out.prices = prices;

    return out;
  })

  const productInput: any = {
      title: newTitle,
      handle: newHandle,
      subtitle: source.subtitle ?? undefined,
      description: source.description ?? undefined,
      status: status ?? source.status ?? undefined,
      shipping_profile_id,
      sales_channels,
      weight: source.weight ?? undefined,
      length: source.length ?? undefined,
      height: source.height ?? undefined,
      width: source.width ?? undefined,
      thumbnail: source.thumbnail ?? undefined,
      images: imagesInput,
      options: optionsInput,
      variants: variantsInput,
    }

    if (copy_metadata) 
    {
        productInput.metadata = source.metadata ?? undefined;
    }

    if (categoriesInput.length) 
    {
        productInput.category_ids = categoriesInput;
    }

    const { result } = await createProductsWorkflow(req.scope).run({
      input: { products: [productInput] },
    })

  const created = Array.isArray(result) ? result[0] : null

    if (!created?.id) {
      res.status(500).json({
        product: { id: "", title: "" } as any,
        message: "Product creation returned no id",
      })
      return
    }

    res.json({
      product: {
        id: created.id,
        title: created.title,
        handle: created.handle,
      },
    })

    }catch(e: any) 
    {
    console.error("Duplicate product failed", e)
    res.status(500).json({ product: { id: "", title: "" } as any, message: e?.message ?? "Duplicate product failed",})
    }
}

