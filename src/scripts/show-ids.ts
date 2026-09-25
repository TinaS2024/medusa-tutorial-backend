import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Zeigt die IDs, die der CSV-Produktimport als Spaltenwerte braucht:
 * Sales Channels und Shipping Profiles.
 *
 * Aufruf: npx medusa exec ./src/scripts/show-ids.ts
 */
export default async function showIds({ container }: { container: any }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name", "is_disabled"],
  });
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
  });
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id"],
  });

  logger.info("=== Sales Channels (Spalte 'Product Sales Channel 1') ===");
  for (const channel of channels) {
    const hinweis = channel.is_disabled ? "  [deaktiviert]" : "";
    logger.info(`${channel.id}   ${channel.name}${hinweis}`);
  }
  logger.info(`Standard des Stores: ${stores[0]?.default_sales_channel_id ?? "keiner gesetzt"}`);

  logger.info("=== Shipping Profiles (Spalte 'Shipping Profile Id') ===");
  for (const profile of profiles) {
    logger.info(`${profile.id}   ${profile.name}   (type: ${profile.type})`);
  }
}
