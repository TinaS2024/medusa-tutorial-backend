import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Select, Text, Textarea, toast } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

type Antwort = {
  custom: Record<string, any>
  defaults: Record<string, any>
  felder: Record<string, string[]>
}

const SPRACHEN = ["de", "en", "fr", "nl"] as const;

const Section = ({
  title, children, defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) => (
  <details open={defaultOpen} className="rounded-lg border border-ui-border-base bg-ui-bg-subtle">
    <summary className="cursor-pointer select-none px-4 py-3">
      <span className="font-medium">{title}</span>
    </summary>
    <div className="grid gap-y-4 border-t border-ui-border-base p-4">{children}</div>
  </details>
)

/** Liest die Platzhalter aus einem Text, damit die Liste nie veraltet. */
const platzhalterAus = (text: unknown): string[] => {
  if (typeof text !== "string") return []
  return Array.from(new Set(text.match(/\{\w+\}/g) ?? []))
}

const EmailTextsPage = () => {
  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).email_texts;

  const [sprache, setSprache] = useState<string>("de");
  const [werte, setWerte] = useState<Record<string, any>>({});

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const { data, isLoading, refetch } = useQuery<Antwort>({
    queryKey: ["email-templates"],
    queryFn: () => sdk.client.fetch("/admin/email-templates", { method: "GET" }),
  })

  useEffect(() => {
    if (data?.custom) setWerte(data.custom)
  }, [data])

  const wert = (vorlage: string, feld: string): string =>
    werte?.[sprache]?.[vorlage]?.[feld] ?? ""

  const setzeFeld = (vorlage: string, feld: string) => (v: string) =>
    setWerte((prev) => ({
      ...prev,
      [sprache]: {
        ...prev?.[sprache],
        [vorlage]: { ...prev?.[sprache]?.[vorlage], [feld]: v },
      },
    }))

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async () =>
      sdk.client.fetch("/admin/email-templates", {
        method: "POST",
        body: { custom: werte },
      }),
  })

  const onSave = async () => {
    try {
      await mutateAsync()
      toast.success(t.save_info)
      await refetch()
    } catch (e: any) {
      toast.error(e?.message || t.save_error)
    }
  }

  const felder = data?.felder ?? {}
  const vorgaben = data?.defaults?.[sprache] ?? {}

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2">{t.intro}</Text>

        <div className="mt-6 max-w-[240px]">
          <Label>{t.language}</Label>
          <Select value={sprache} onValueChange={setSprache}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {SPRACHEN.map((s) => (
                <Select.Item key={s} value={s}>{s.toUpperCase()}</Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>

        <div className="mt-6 grid gap-y-5">
          {Object.keys(felder).map((vorlage, i) => {
            const vorgabe = vorgaben?.[vorlage] ?? {}
            const marken = platzhalterAus(vorgabe.text)

            return (
              <Section
                key={vorlage}
                title={(t as any)[`tpl_${vorlage}`] ?? vorlage}
                defaultOpen={i === 0}
              >
                {felder[vorlage].map((feld) => {
                  const mehrzeilig = feld === "text" || feld === "prepayment_section"

                  return (
                    <div key={feld}>
                      <Label>{(t as any)[`f_${feld}`] ?? feld}</Label>
                      {mehrzeilig ? (
                        <Textarea
                          rows={8}
                          value={wert(vorlage, feld)}
                          onChange={(e) => setzeFeld(vorlage, feld)(e.target.value)}
                          placeholder={vorgabe[feld] ?? ""}
                          disabled={isLoading}
                        />
                      ) : (
                        <Input
                          value={wert(vorlage, feld)}
                          onChange={(e) => setzeFeld(vorlage, feld)(e.target.value)}
                          placeholder={vorgabe[feld] ?? ""}
                          disabled={isLoading}
                        />
                      )}
                    </div>
                  )
                })}

                {marken.length > 0 && (
                  <div className="rounded-md border border-ui-border-base p-3">
                    <Text size="small" className="font-medium">{t.placeholders}</Text>
                    <Text size="small" className="text-ui-fg-subtle mb-2">{t.placeholders_hint}</Text>
                    <div className="flex flex-wrap gap-2">
                      {marken.map((m) => (
                        <code key={m} className="rounded bg-ui-bg-base px-2 py-1 text-xs">{m}</code>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )
          })}

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
  label: getMessages(getClientLanguage()).email_texts.menu,
  icon: CubeSolid,
})

export default EmailTextsPage;
