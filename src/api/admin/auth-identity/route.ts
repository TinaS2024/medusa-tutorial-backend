import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

// GET /admin/auth-identity?email=…  – zeigt, was für die E-Mail existiert
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const email = (req.query.email as string | undefined)?.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ message: "Query-Parameter 'email' fehlt" });
    return;
  }

  const authModuleService = req.scope.resolve(Modules.AUTH);
  const customerModuleService = req.scope.resolve(Modules.CUSTOMER);
  const userModuleService = req.scope.resolve(Modules.USER);

  const providerIdentities = await authModuleService.listProviderIdentities(
    { provider: "emailpass" },
    { select: ["id", "auth_identity_id", "entity_id"] }
  );
  const identities = providerIdentities.filter(
    (pi) => (pi.entity_id ?? "").toLowerCase() === email
  );

  const customers = await customerModuleService.listCustomers(
    { email }, { select: ["id", "email", "has_account"] }
  );
  const admin_users = await userModuleService.listUsers(
    { email }, { select: ["id", "email"] }
  );

  res.json({
    email,
    provider_identities: identities,
    customers,
    admin_users,
    summary: { identities: identities.length, customers: customers.length, admin_users: admin_users.length },
  });
}

// DELETE /admin/auth-identity?email=…  – gibt eine KUNDEN-E-Mail komplett frei
// (Kunde + Login-Identität). Admin-User werden geschützt.
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const email = (req.query.email as string | undefined)?.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ message: "Query-Parameter 'email' fehlt" });
    return;
  }

  const authModuleService = req.scope.resolve(Modules.AUTH);
  const customerModuleService = req.scope.resolve(Modules.CUSTOMER);
  const userModuleService = req.scope.resolve(Modules.USER);

  // Schutz: niemals einen Admin-User-Zugang anfassen.
  const users = await userModuleService.listUsers({ email }, { select: ["id"] });
  if (users.length > 0) {
    res.status(409).json({
      message: `Für ${email} existiert ein Admin-User – Freigabe verweigert (Admin-Zugang geschützt). Diesen User ggf. zuerst unter Einstellungen → Benutzer löschen.`,
    });
    return;
  }

  // Login-Identitäten (emailpass)
  const providerIdentities = await authModuleService.listProviderIdentities(
    { provider: "emailpass" },
    { select: ["auth_identity_id", "entity_id"] }
  );
  const authIdentityIds = [
    ...new Set(
      providerIdentities
        .filter((pi) => (pi.entity_id ?? "").toLowerCase() === email)
        .map((pi) => pi.auth_identity_id)
        .filter(Boolean)
    ),
  ] as string[];

  // Kunden direkt über das Modul löschen – umgeht die fehlerhafte Admin-Kaskade
  // ("Auth identity not found"), wenn Kunde und Identität entkoppelt sind.
  const customers = await customerModuleService.listCustomers({ email }, { select: ["id"] });
  const customerIds = customers.map((c) => c.id);

  if (customerIds.length > 0) {
    await customerModuleService.deleteCustomers(customerIds);
  }
  if (authIdentityIds.length > 0) {
    await authModuleService.deleteAuthIdentities(authIdentityIds);
  }

  res.json({ email, deleted_customers: customerIds, deleted_auth_identities: authIdentityIds });
}
