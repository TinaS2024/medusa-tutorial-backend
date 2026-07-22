import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { promises as fs } from "fs";
import { join } from "path";

type OrderPlacedEvent = { id: string };

const firstString = (v: unknown): string | undefined => typeof v === "string" && v.trim() ? v : undefined;

export default async function orderPlacedGpeSubscriber({event: { data }, container, }: SubscriberArgs<OrderPlacedEvent>) 
{

    console.log("[GPE] order.placed empfangen:", data);
    
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: [
      "id", "display_id", "currency_code", "total", "email", "created_at",
      "customer.id", "customer.email", "customer.first_name", "customer.last_name",
      "shipping_address.first_name", "shipping_address.last_name",
      "shipping_address.address_1", "shipping_address.postal_code",
      "shipping_address.city", "shipping_address.country_code",
      "items.id", "items.title", "items.quantity", "items.unit_price",
      "items.metadata", "items.product_id", "items.variant_id",
      "items.product.title", "items.product.metadata",
      "items.variant.title", "items.variant.metadata",
    ],
    filters: { id: data.id },
  });

    console.log("[GPE] Order geladen:", order?.display_id, "Items:", order?.items?.length);


  if (!order) 
    {
    console.error(`[GPE] Bestellung ${data.id} nicht gefunden.`);
    return;
  }

  const items = (order.items ?? [])
    .map((item: any) => {
      const meta = item.metadata ?? {};
      const productMeta = item.product?.metadata ?? {};
      const variantMeta = item.variant?.metadata ?? {};

      const svgUrl = firstString(meta.svg_url);
      // Nur Positionen mit Design sind für die GPE relevant
      if (!svgUrl && !firstString(meta.design_image)) return null;

      return {
        line_item_id: item.id,
        quantity: item.quantity,
        product: {
          product_id: item.product_id,
          variant_id: item.variant_id,
          title: item.product?.title ?? item.title,
          variant_title: item.variant?.title ?? null,
          // GPE-Identität (aus dem Produkt-Sync). null = kein GPE-Produkt.
          gpe_id: productMeta.gpe_id ?? null,
          gpe_name: productMeta.gpe_name ?? null,
          gpe_external_id: productMeta.gpe_external_id ?? null,
          designer_shape: firstString(variantMeta.designer_shape) ?? firstString(productMeta.designer_shape) ?? null,
          designer_category: firstString(variantMeta.designer_category) ?? firstString(productMeta.designer_category) ?? null,
          width_mm: meta.width ?? null,
          height_mm: meta.height ?? null,
          thickness_mm: meta.thickness ?? null,
        },
        design: {
          svg_url: svgUrl ?? null,
          png_url: firstString(meta.design_image) ?? null,
        },
      };
    })
    .filter(Boolean);

  if (items.length === 0) {
    console.log(`[GPE] Bestellung ${order.display_id}: keine Design-Positionen, übersprungen.`);
    return;
  }

  const manifest = {
    order: {
      id: order.id,
      display_id: order.display_id,
      placed_at: order.created_at,
      currency: order.currency_code,
      total: order.total,
    },
    customer: {
      id: order.customer?.id ?? null,
      email: order.customer?.email ?? order.email ?? null,
      name: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || null,
    },
    shipping_address: order.shipping_address ?? null,
    items,
  };

  const outboxDir = process.env.GPE_OUTBOX_DIR || join(process.cwd(), "..", "gpe-outbox");

  await fs.mkdir(outboxDir, { recursive: true });

  const filePath = join(outboxDir, `order_${order.display_id}.json`);
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`[GPE] Manifest geschrieben: ${filePath}`);
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
