import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Text, Textarea, toast, Select } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

const LEER = {
  imprint_company: "",
  imprint_address: "",
  imprint_represented_by: "",
  imprint_phone: "",
  imprint_email: "",
  imprint_register: "",
  imprint_vat_id: "",
  imprint_extra: "",
}

const Feld = ({
  label, hint, wert, onChange, mehrzeilig = false, disabled = false,
}: {
  label: string
  hint?: string
  wert: string
  onChange: (v: string) => void
  mehrzeilig?: boolean
  disabled?: boolean
}) => (
  <div>
    <Label>{label}</Label>
    {hint && <Text size="small" className="text-ui-fg-subtle mb-1">{hint}</Text>}
    {mehrzeilig ? (
      <Textarea rows={14} value={wert} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    ) : (
      <Input value={wert} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    )}
  </div>
)

const LegalPage = () => {
  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).legal;
  const [werte, setWerte] = useState(LEER);

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const { data, isLoading, refetch } = useQuery<{ 
    legal: Record<string, string | null> 
    texts: Record<string, any>
  }>({
    queryKey: ["legal"],
    queryFn: () => sdk.client.fetch("/admin/legal", { method: "GET" }),
  })

  const [sprache, setSprache] = useState("de");
  const [texte, setTexte] = useState<Record<string, any>>({});


    useEffect(() => {
    if (!data) return;
    if (data.legal) {
      const neu = { ...LEER };
      for (const k of Object.keys(LEER) as (keyof typeof LEER)[]) 
      {
        neu[k] = data.legal[k] ?? "";
      }
      setWerte(neu);
    }
    if (data.texts) setTexte(data.texts);
  }, [data])

  const textWert = (dok: string): string => texte?.[sprache]?.[dok] ?? "";

  const setzeText = (dok: string) => (v: string) =>
    setTexte((prev) => ({
      ...prev,
      [sprache]: { ...prev?.[sprache], [dok]: v },
    }));


  const set = (k: keyof typeof LEER) => (v: string) => setWerte((prev) => ({ ...prev, [k]: v }));

  const { mutateAsync, isPending } = useMutation({mutationFn: async () => sdk.client.fetch("/admin/legal", { method: "POST", body: { ...werte, texts: texte } }), });

  const onSave = async () => {
    try {
      await mutateAsync();
      toast.success(t.save_info);
      await refetch();
    } catch (e: any) 
    {
      toast.error(e?.message || t.save_error);
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2">{t.intro}</Text>

          <div className="mt-6 grid gap-y-4 max-w-2xl">
          <Heading level="h2" className="text-base">{t.section_imprint}</Heading>
          <Feld label={t.company} wert={werte.imprint_company} onChange={set("imprint_company")} />
          <Feld label={t.company} wert={werte.imprint_company} onChange={set("imprint_company")} />
          <Feld label={t.address} hint={t.address_hint} wert={werte.imprint_address} onChange={set("imprint_address")} mehrzeilig />
          <Feld label={t.represented_by} hint={t.represented_by_hint} wert={werte.imprint_represented_by} onChange={set("imprint_represented_by")} />
          <Feld label={t.phone} wert={werte.imprint_phone} onChange={set("imprint_phone")} />
          <Feld label={t.email} wert={werte.imprint_email} onChange={set("imprint_email")} />
          <Feld label={t.register} hint={t.register_hint} wert={werte.imprint_register} onChange={set("imprint_register")} />
          <Feld label={t.vat_id} wert={werte.imprint_vat_id} onChange={set("imprint_vat_id")} />
          <Feld label={t.extra} hint={t.extra_hint} wert={werte.imprint_extra} onChange={set("imprint_extra")} mehrzeilig />

          <div className="pt-6 border-t border-ui-border-base">
            <Label>{t.language}</Label>
            <Text size="small" className="text-ui-fg-subtle mb-1">{t.language_hint}</Text>
            <div className="max-w-[200px]">
              <Select value={sprache} onValueChange={setSprache}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {["de", "en", "fr", "nl"].map((s) => (
                    <Select.Item key={s} value={s}>{s.toUpperCase()}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>

          <Feld label={t.terms} hint={t.texts_hint} wert={textWert("terms")} onChange={setzeText("terms")} mehrzeilig disabled={isLoading} />
          <Feld label={t.privacy} wert={textWert("privacy")} onChange={setzeText("privacy")} mehrzeilig disabled={isLoading} />
          <Feld label={t.withdrawal} wert={textWert("withdrawal")} onChange={setzeText("withdrawal")} mehrzeilig disabled={isLoading} />

          <div className="flex justify-end gap-x-2">
            <Button variant="secondary" disabled={isPending} onClick={() => refetch()}>{t.reload}</Button>
            <Button variant="primary" isLoading={isPending} onClick={onSave}>{t.save}</Button>
          </div>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).legal.menu,
  icon: CubeSolid,
})

export default LegalPage;
