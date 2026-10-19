import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * Korrigiert alte Formnamen in den Designer-Metadaten:
 * "circle" -> "round", "ellipse" -> "oval".
 * Die Trodat- und COLOP-Importe hatten die falschen Namen geschrieben;
 * Designer, Shop und GPE-Export kennen nur rect, round und oval.
 *
 *   npx medusa exec ./src/scripts/fix-designer-shape-names.ts         nur anzeigen
 *   npx medusa exec ./src/scripts/fix-designer-shape-names.ts write   tatsächlich schreiben
 */

const SHAPE_FIXES: Record<string, string> = { circle: "round", ellipse: "oval" };

export default async function fixDesignerShapeNames({ container, args }: { container: any; args: string[] }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModule = container.resolve(Modules.PRODUCT);

  const shouldWrite = (args ?? []).includes("write");
  logger.info(shouldWrite ? "[form] SCHREIBEN aktiv" : "[form] Probelauf – es wird nichts geändert");

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata", "variants.id", "variants.title", "variants.metadata"],
  });

  let productCount = 0;
  let variantCount = 0;

  for (const product of products as any[]) {
    const newProductShape = SHAPE_FIXES[product.metadata?.designer_shape];
    if (newProductShape) {
      if (shouldWrite) {
        await productModule.updateProducts(product.id, {
          metadata: { ...product.metadata, designer_shape: newProductShape },
        });
      }
      productCount++;
      logger.info(`[form] Produkt ${product.title}: ${product.metadata.designer_shape} → ${newProductShape}`);
    }

    for (const variant of product.variants ?? []) {
      const newVariantShape = SHAPE_FIXES[variant.metadata?.designer_shape];
      if (!newVariantShape) continue;
      if (shouldWrite) {
        await productModule.updateProductVariants(variant.id, {
          metadata: { ...variant.metadata, designer_shape: newVariantShape },
        });
      }
      variantCount++;
      logger.info(`[form]   Variante ${product.title} / ${variant.title}: ${variant.metadata.designer_shape} → ${newVariantShape}`);
    }
  }

  logger.info(`[form] Fertig: ${productCount} Produkt(e), ${variantCount} Variante(n) ${shouldWrite ? "geändert" : "würden geändert"}.`);
}
