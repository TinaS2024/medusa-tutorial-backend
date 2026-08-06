import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Select, Text, toast } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";


type EmailSettings = {
  email_from: string | null
  email_from_name: string | null
  storefront_url: string | null
  email_locale: "de" | "en" | "fr" | "nl" | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_pass: string | null
}


const EmailSettingsPage = () => {
  const [emailFrom, setEmailFrom] = useState("");
  const [emailFromName, setEmailFromName] = useState("");
  const [storefrontUrl, setStorefrontUrl] = useState("");
  const [emailLocale, setEmailLocale] = useState<"de" | "en" | "fr" | "nl">("de");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");

  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).email_settings;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);



  const { data, isLoading, refetch } = useQuery<{ email_settings: EmailSettings }>(
    {
      queryKey: ["email-settings"],
      queryFn: () =>
        sdk.client.fetch("/admin/email-settings", {
          method: "GET",
        }),
    }
  )

  useEffect(() => {
    const s = data?.email_settings
    if (!s) return
    setEmailFrom(s.email_from ?? "")
    setEmailFromName(s.email_from_name ?? "")
    setStorefrontUrl(s.storefront_url ?? "")
    setEmailLocale((s.email_locale ?? "de") as any)
    setSmtpHost(s.smtp_host ?? "")
    setSmtpPort(s.smtp_port != null ? String(s.smtp_port) : "")
    setSmtpUser(s.smtp_user ?? "")
    setSmtpPass(s.smtp_pass ?? "")

  }, [data])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async () => {
      return sdk.client.fetch("/admin/email-settings", {
        method: "POST",
        body: {
          email_from: emailFrom,
          email_from_name: emailFromName,
          storefront_url: storefrontUrl,
          email_locale: emailLocale,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_user: smtpUser,
          smtp_pass: smtpPass,
        },

      })
    },
  })

  const onSave = async () => {
    try {
      await mutateAsync()
      toast.success("E-Mail Einstellungen gespeichert")
      await refetch()
    } catch (e: any) {
      toast.error(e?.message || "Speichern fehlgeschlagen")
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.save_info}</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          {t.intro}
        </Text>

        <div className="mt-6 grid gap-y-4">
          <div>
            <Label>{t.from}</Label>
            <Input
              value={emailFrom}
              onChange={(e) => setEmailFrom(e.target.value)}
              placeholder="firma@domain.de"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label>{t.from_name}</Label>
            <Input
              value={emailFromName}
              onChange={(e) => setEmailFromName(e.target.value)}
              placeholder="Stempel & Schilder"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label>{t.storefront_url}</Label>
            <Input
              value={storefrontUrl}
              onChange={(e) => setStorefrontUrl(e.target.value)}
              placeholder="http://localhost:8000"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label>{t.locale}</Label>
            <Select value={emailLocale} onValueChange={(v) => setEmailLocale(v as any)}>
              <Select.Trigger>
                <Select.Value placeholder="Sprache auswählen" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="de">Deutsch</Select.Item>
                <Select.Item value="en">English</Select.Item>
                <Select.Item value="fr">Français</Select.Item>
                <Select.Item value="nl">Nederlands</Select.Item>
              </Select.Content>
            </Select>
          </div>

                    <div>
            <Label>{t.smtp_host}</Label>
            <Input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.domain.de"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label>{t.smtp_port}</Label>
            <Input
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label>{t.smtp_user}</Label>
            <Input
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="firma@domain.de"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label>{t.smtp_pass}</Label>
            <Input
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end gap-x-2">
            <Button variant="secondary" disabled={isPending} onClick={() => refetch()}>
              {t.reload}
            </Button>
            <Button variant="primary" isLoading={isPending} onClick={onSave}>
              {t.save}
            </Button>
          </div>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).email_settings.menu,
  icon: CubeSolid,
})

export default EmailSettingsPage;