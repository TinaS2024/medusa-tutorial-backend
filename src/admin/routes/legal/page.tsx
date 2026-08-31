import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Text, Textarea, toast, Select, Switch } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
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
  cookie_banner_enabled: "",
  cookie_banner_text: ""
}

const Feld = ({
  label, hint, value, onChange, mehrzeilig = false, disabled = false,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  mehrzeilig?: boolean
  disabled?: boolean
}) => (
  <div>
    <Label>{label}</Label>
    {hint && <Text size="small" className="text-ui-fg-subtle mb-1">{hint}</Text>}
    {mehrzeilig ? (
      <Textarea rows={14} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    ) : (
      <Input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    )}
  </div>
)

const LegalPage = () => {
  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).legal;
  const c = getMessages(lang).cookie;
  const [values, setValues] = useState(LEER);

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
  const [texts, setTexts] = useState<Record<string, any>>({});


    useEffect(() => {
    if (!data) return;
    if (data.legal) {
      const newKey = { ...LEER };
      for (const k of Object.keys(LEER) as (keyof typeof LEER)[]) 
      {
        newKey[k] = data.legal[k] ?? "";
      }
      setValues(newKey);
    }
    if (data.texts) setTexts(data.texts);
  }, [data])

  const textValue = (dok: string): string => texts?.[sprache]?.[dok] ?? "";

  const setText = (dok: string) => (v: string) =>
    setTexts((prev) => ({
      ...prev,
      [sprache]: { ...prev?.[sprache], [dok]: v },
    }));


  const set = (k: keyof typeof LEER) => (v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const { mutateAsync, isPending } = useMutation({mutationFn: async () => sdk.client.fetch("/admin/legal", { method: "POST", body: { ...values, texts: texts } }), });

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
          <Feld label={t.company} value={values.imprint_company} onChange={set("imprint_company")} />
          <Feld label={t.company} value={values.imprint_company} onChange={set("imprint_company")} />
          <Feld label={t.address} hint={t.address_hint} value={values.imprint_address} onChange={set("imprint_address")} mehrzeilig />
          <Feld label={t.represented_by} hint={t.represented_by_hint} value={values.imprint_represented_by} onChange={set("imprint_represented_by")} />
          <Feld label={t.phone} value={values.imprint_phone} onChange={set("imprint_phone")} />
          <Feld label={t.email} value={values.imprint_email} onChange={set("imprint_email")} />
          <Feld label={t.register} hint={t.register_hint} value={values.imprint_register} onChange={set("imprint_register")} />
          <Feld label={t.vat_id} value={values.imprint_vat_id} onChange={set("imprint_vat_id")} />
          <Feld label={t.extra} hint={t.extra_hint} value={values.imprint_extra} onChange={set("imprint_extra")} mehrzeilig />

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

          <HtmlFeld label={t.terms} hint={t.texts_hint} value={textValue("terms")} onChange={setText("terms")} disabled={isLoading} />
          <HtmlFeld label={t.privacy} value={textValue("privacy")} onChange={setText("privacy")} disabled={isLoading} />
          <HtmlFeld label={t.withdrawal} value={textValue("withdrawal")} onChange={setText("withdrawal")} disabled={isLoading} />
          <HtmlFeld label={t.shipping} value={textValue("shipping")} onChange={setText("shipping")} disabled={isLoading} />
          
          <div className="pt-6 border-t border-ui-border-base grid gap-y-4">
            <div className="flex items-start gap-x-3">
              <Switch
                checked={values.cookie_banner_enabled === "1"}
                onCheckedChange={(an) => set("cookie_banner_enabled")(an ? "1" : "")}
                disabled={isLoading}
              />
              <div>
                <Label>{c.cookie_enabled}</Label>
                <Text size="small" className="text-ui-fg-subtle">{c.cookie_enabled_hint}</Text>
              </div>
            </div>

            <Feld
              label={c.cookie_text}
              value={values.cookie_banner_text}
              onChange={set("cookie_banner_text")}
              mehrzeilig
              disabled={isLoading}
            />
          </div>

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

const AUSZEICHNUNGEN = [
  { text: "Überschrift", vorne: "<h2>", hinten: "</h2>" },
  { text: "Zwischentitel", vorne: "<h3>", hinten: "</h3>" },
  { text: "Absatz", vorne: "<p>", hinten: "</p>" },
  { text: "Fett", vorne: "<strong>", hinten: "</strong>" },
  { text: "Kursiv", vorne: "<em>", hinten: "</em>" },
  { text: "Unterstrichen", vorne: "<u>", hinten: "</u>" },
  { text: "Liste", vorne: "<ul>\n  <li>", hinten: "</li>\n</ul>" },
]

/**
 * Textfeld für Rechtstexte mit einfachen Auszeichnungen.
 *
 * Die Knöpfe legen die gewählte Auszeichnung um den markierten Text – wer
 * nichts markiert hat, bekommt ein leeres Paar an der Schreibmarke.
 */
const HtmlFeld = ({
  label, hint, value, onChange, disabled = false,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) => {
  const ref = useRef<HTMLTextAreaElement>(null)

  const umschliessen = (vorne: string, hinten: string) => {
    const el = ref.current
    if (!el) return

    const start = el.selectionStart
    const ende = el.selectionEnd
    const markiert = value.slice(start, ende)

    onChange(value.slice(0, start) + vorne + markiert + hinten + value.slice(ende))

    // Markierung nach dem Einfügen erhalten, damit man weitertippen kann
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + vorne.length, ende + vorne.length)
    })
  }

  return (
    <div>
      <Label>{label}</Label>
      {hint && <Text size="small" className="text-ui-fg-subtle mb-1">{hint}</Text>}

      <div className="flex flex-wrap gap-1 mb-2">
        {AUSZEICHNUNGEN.map((a) => (
          <Button
            key={a.text}
            type="button"
            variant="secondary"
            size="small"
            disabled={disabled}
            onClick={() => umschliessen(a.vorne, a.hinten)}
          >
            {a.text}
          </Button>
        ))}
      </div>

      <textarea
        ref={ref}
        rows={16}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-ui-border-base bg-ui-bg-field p-3 font-mono text-sm"
      />
    </div>
  )
}

export default LegalPage;
