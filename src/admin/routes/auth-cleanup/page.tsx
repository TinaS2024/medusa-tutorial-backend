import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui";
import { useState } from "react";
import { sdk } from "../../lib/sdk";

const AuthCleanupPage = () => {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const r = await sdk.client.fetch<{ deleted: string[] }>("/admin/auth-identity", {
        method: "DELETE",
        query: { email: email.trim() },
      });
      toast.success(`Freigegeben (${r.deleted?.length ?? 0} Identität(en) gelöscht)`);
      setEmail("");
    } catch (e: any) {
      toast.error(e?.message || "Löschen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">E-Mail / Login freigeben</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Löscht die Login-Identität (emailpass) einer E-Mail, damit sie erneut registriert werden kann.
          Nur nutzen, wenn der zugehörige Kunde nicht mehr existiert.
        </Text>
        <div className="mt-6 grid gap-y-4 max-w-md">
          <div>
            <Label>E-Mail</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kunde@domain.de"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="danger" isLoading={busy} onClick={onDelete}>
              Login-Identität löschen
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "E-Mail freigeben",
  icon: CubeSolid,
});

export default AuthCleanupPage;
