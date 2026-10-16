import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Stellt die COLOP-Produkte gesammelt auf "veröffentlicht" oder "Entwurf" –
 * der Admin kann das nur einzeln.
 *
 * Aufruf (im Ordner medusa-backend):
 *   npx medusa exec ./src/scripts/set-colop-status.ts veroeffentlichen alle probelauf
 *   npx medusa exec ./src/scripts/set-colop-status.ts veroeffentlichen alle
 *   npx medusa exec ./src/scripts/set-colop-status.ts entwurf kissen
 *
 * 1. Wort: veroeffentlichen | entwurf
 * 2. Wort: stempel | kissen | alle
 * "probelauf" am Ende: nur anzeigen, nichts ändern.
 */
export default async function setColopStatus({ container, args }: { container: any; args: string[] }) 
{
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const [action, group = "alle"] = args ?? [];
  const dryRun = (args ?? []).includes("probelauf");

  const status =
    action === "veroeffentlichen" ? ProductStatus.PUBLISHED :
    action === "entwurf" ? ProductStatus.DRAFT :
    null;

  if (!status || !["stempel", "kissen", "alle"].includes(group)) 
  {
    logger.error(
      "[colop-status] Aufruf: set-colop-status.ts veroeffentlichen|entwurf stempel|kissen|alle [probelauf]"
    );
    return;
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "metadata"],
  });

  // Kissen erkennt man an pad_type (aus import-colop-pads.ts), Stempel am Fehlen davon.
  const selected = products.filter((p: any) => {
    if (p.metadata?.manufacturer !== "COLOP") return false;
    const isPad = !!p.metadata?.pad_type;
    if (group === "stempel") return !isPad;
    if (group === "kissen") return isPad;
    return true;
  });

  const toChange = selected.filter((p: any) => p.status !== status);

  logger.info(
    `[colop-status] ${selected.length} COLOP-Produkt(e) in "${group}", ` +
      `${toChange.length} davon werden auf "${status}" gestellt` +
      `${dryRun ? " – PROBELAUF, es wird nichts geändert" : ""}.`
  );
  for (const p of toChange) logger.info(`[colop-status]   ${p.title}`);

  if (dryRun || toChange.length === 0) return;

  for (let start = 0; start < toChange.length; start += 50) 
  {
    await updateProductsWorkflow(container).run({
      input: {
        products: toChange.slice(start, start + 50).map((p: any) => ({ id: p.id, status })),
      },
    });
  }

  logger.info(`[colop-status] fertig.`);
}
