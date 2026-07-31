import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { promises as fs } from "fs";
import { join } from "path";

export default async function exportProducts({ container }: { container: any }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "subtitle", "description", "handle", "status",
      "is_giftcard", "discountable", "thumbnail",
      "weight", "length", "height", "width",
      "hs_code", "mid_code", "material", "origin_country",
      "metadata",
      "type.value",
      "collection.handle", "collection.title",
      "categories.name", "categories.handle",
      "tags.value",
      "images.url", "images.rank",
      "options.id", "options.title", "options.values.value",
      "variants.title", "variants.sku", "variants.barcode",
      "variants.manage_inventory", "variants.allow_backorder",
      "variants.weight", "variants.metadata",
      "variants.options.value", "variants.options.option.title",
      "variants.prices.amount", "variants.prices.currency_code",
    ],
  });

  const outPath = join(process.cwd(), "products-export.json");
  await fs.writeFile(outPath, JSON.stringify(products, null, 2), "utf-8");
  logger.info(`[export] ${products.length} Produkte exportiert nach ${outPath}`);
}
