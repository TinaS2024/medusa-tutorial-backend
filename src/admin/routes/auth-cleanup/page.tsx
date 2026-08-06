import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui";
import { useState, useEffect } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

const AuthCleanupPage = () => {
  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).auth_cleanup;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
        const r = await sdk.client.fetch<{
        deleted_customers: string[]
        deleted_auth_identities: string[]
      }>("/admin/auth-identity", {
        method: "DELETE",
        query: { email: email.trim() },
      });
      toast.success(
        t.success
          .replace("{customers}", String(r.deleted_customers?.length ?? 0))
          .replace("{identities}", String(r.deleted_auth_identities?.length ?? 0))
      );
      setEmail("");
    } catch (e: any) {
      toast.error(e?.message || t.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2">
           {t.intro}
        </Text>
        <div className="mt-6 grid gap-y-4 max-w-md">
          <div>
            <Label>{t.email}</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kunde@domain.de"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="danger" isLoading={busy} onClick={onDelete}>
              {t.delete}
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).auth_cleanup.menu,
  icon: CubeSolid,
});

export default AuthCleanupPage;
