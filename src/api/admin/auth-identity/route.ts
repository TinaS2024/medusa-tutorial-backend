import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

// DELETE /admin/auth-identity?email=kunde@domain.de
export async function DELETE(req: MedusaRequest, res: MedusaResponse) 
{
  const email = (req.query.email as string | undefined)?.trim().toLowerCase();

  if (!email) {
    res.status(400).json({ message: "Query-Parameter 'email' fehlt" });
    return;
  }

  const authModuleService = req.scope.resolve(Modules.AUTH);

  // Alle emailpass-Identitäten holen und unabhängig von Groß-/Kleinschreibung vergleichen
  const providerIdentities = await authModuleService.listProviderIdentities(
    { provider: "emailpass" },
    { select: ["auth_identity_id", "entity_id"] }
  );

  const matches = providerIdentities.filter(
    (pi) => (pi.entity_id ?? "").toLowerCase() === email
  );

  if (!matches.length) {
    res.status(404).json({ message: "Keine Login-Identität für diese E-Mail gefunden" });
    return;
  }

  const authIdentityIds = [
    ...new Set(matches.map((pi) => pi.auth_identity_id).filter(Boolean)),
  ] as string[];

  await authModuleService.deleteAuthIdentities(authIdentityIds);

  res.json({ deleted: authIdentityIds, email });
}
