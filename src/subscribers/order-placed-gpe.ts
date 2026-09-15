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
      "customer.metadata",
      "shipping_address.first_name", "shipping_address.last_name",
      "shipping_address.address_1", "shipping_address.postal_code",
      "shipping_address.city", "shipping_address.country_code",
      "billing_address.first_name", "billing_address.last_name",
      "billing_address.address_1", "billing_address.postal_code",
      "billing_address.city", "billing_address.country_code",
      "items.id", "items.title", "items.quantity", "items.unit_price", "items.detail.quantity",
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

  // Bündel nachschlagen: welches Bündel-Produkt besteht aus welchen Bestandteilen?
  // Abgefragt von der Bündel-Seite aus (bundle -> product, items -> product) –
  // denselben Weg nutzen add-bundl-to-cart und die Store-Route bereits.
  // Eigener try/catch: klappt die Abfrage nicht, entsteht das Manifest trotzdem,
  // nur ohne Auflösung der Bündel.
  const bundleByProductId = new Map<string, any>();
  try 
  {
    const { data: bundles } = await query.graph({
      entity: "bundle",
      fields: [
        "id", "title", "product.id",
        "items.quantity", "items.product.id", "items.product.title", "items.product.metadata",
      ],
    });

    for (const bundle of bundles as any[]) 
    {
      if (bundle.product?.id && bundle.items?.length) 
      {
        bundleByProductId.set(bundle.product.id, bundle);
      }
    }
    console.log("[GPE] Bündel geladen:", [...bundleByProductId.keys()]);
  } 
  catch (error) 
  {
    console.error("[GPE] Bündel konnten nicht geladen werden – Positionen werden nicht aufgelöst:", error);
  }

    const items = (order.items ?? [])
    .flatMap((item: any) => {
      const meta = item.metadata ?? {};
      const productMeta = item.product?.metadata ?? {};
      const variantMeta = item.variant?.metadata ?? {};

      const svgUrl = firstString(meta.svg_url);
      // Nur Positionen mit Design sind für die GPE relevant
      if (!svgUrl && !firstString(meta.design_image)) return [];

      const entry = {
        line_item_id: item.id,
        quantity: item.detail?.quantity ?? item.quantity ?? 1,
        unit_price: item.unit_price ?? null,

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
        designText: firstString(meta.designText) ?? null,
        design: {
          svg_url: svgUrl ?? null,
          png_url: firstString(meta.design_image) ?? null,
        },
      };

      // Kein Bündel-Produkt -> eine Position wie bisher
      const bundle = bundleByProductId.get(item.product_id);
      if (!bundle) return [entry];

      // Bündel-Produkt -> eine Position je Bestandteil. Design, Form und Maße
      // kommen vom bestellten Bündel-Produkt; der Setpreis wird gleichmäßig
      // auf alle Einzelstücke verteilt.
      const unitsPerSet = bundle.items.reduce(
        (sum: number, part: any) => sum + (part.quantity ?? 1), 0
      );
      const unitShare = entry.unit_price != null
        ? Math.round((entry.unit_price / unitsPerSet) * 100) / 100
        : null;

      if (unitShare != null && Math.abs(unitShare * unitsPerSet - entry.unit_price) > 0.001) 
      {
        console.warn(
          `[GPE] Setpreis ${entry.unit_price} ist nicht glatt durch ${unitsPerSet} teilbar – ` +
          `die Summe der Positionen weicht um Cent-Beträge ab.`
        );
      }

      return bundle.items.map((part: any) => {
        const partMeta = part.product?.metadata ?? {};
        return {
          ...entry,
          quantity: (part.quantity ?? 1) * entry.quantity,
          unit_price: unitShare,
          bundle: { product_id: item.product_id, title: bundle.title },
          product: {
            ...entry.product,
            product_id: part.product?.id ?? null,
            variant_id: null,
            title: part.product?.title ?? null,
            variant_title: null,
            gpe_id: partMeta.gpe_id ?? null,
            gpe_name: partMeta.gpe_name ?? null,
            gpe_external_id: partMeta.gpe_external_id ?? null,
          },
        };
      });
    });

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
      customer_gpe_id: (order.customer?.metadata as any)?.gpe_id ?? null,
      email: order.customer?.email ?? order.email ?? null,
      name: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || null,
    },
    shipping_address: order.shipping_address ?? null,
    billing_address: order.billing_address ?? null,
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
