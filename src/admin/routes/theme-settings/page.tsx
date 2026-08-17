import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Text, toast, Select } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

type ThemeTexts = ReturnType<typeof getMessages>["theme_settings"]


type ThemeSettings = {
  theme_surface_bg: string | null
  theme_border: string | null
  theme_primary: string | null
  theme_primary_hover: string | null
  theme_button_text: string | null
  theme_header_bg: string | null
  theme_hero_bg: string | null
  theme_page_bg: string | null
  theme_page_text: string | null
  theme_footer_bg: string | null
  theme_logo_url: string | null
  theme_hero_url: string | null
  theme_hover_bg: string | null
  theme_font: string | null
}

const DEFAULTS = {
  theme_surface_bg: "#F9FAFB",
  theme_border: "#E5E7EB",
  theme_primary: "#431407",
  theme_primary_hover: "#7c2d12",
  theme_button_text: "#ffffff",
  theme_header_bg: "#431407",
  theme_hero_bg: "#F9FAFB",
  theme_page_bg: "#F9FAFB",
  theme_page_text: "#431407",
  theme_footer_bg: "#431407",
  theme_logo_url: "",
  theme_hero_url: "",
  theme_hover_bg: "F4F4F5",
  theme_font: "default",
}
const Section = ({
  title, hint, children, defaultOpen = false,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) => (
  <details open={defaultOpen} className="rounded-lg border border-ui-border-base bg-ui-bg-subtle">
    <summary className="cursor-pointer select-none px-4 py-3">
      <span className="font-medium">{title}</span>
      {hint && (
        <span className="text-ui-fg-subtle text-sm ml-2">— {hint}</span>
      )}
    </summary>
    <div className="grid gap-y-5 border-t border-ui-border-base p-4">
      {children}
    </div>
  </details>
)

const ColorField = ({
  label, hint, value, onChange, disabled,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) => {

  return(
  <div>
    <Label>{label}</Label>
    {hint && <Text size="small" className="text-ui-fg-subtle mb-1">{hint}</Text>}
    <div className="flex items-center gap-x-2">
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-14 cursor-pointer rounded border border-ui-border-base bg-ui-bg-field p-1"
      />
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#431407"
        className="max-w-[140px]"
      />
    </div>
  </div>
)
}

const ImageField = ({
  label, hint, value, onChange, disabled, previewBg,t
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  previewBg?: string
  t: ThemeTexts
}) => {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { files } = await sdk.admin.upload.create({ files: [file] })
      const url = files?.[0]?.url
      if (!url) throw new Error(t.upload_no_url)
      onChange(url)
      toast.success(t.upload_info)
    } catch (err: any) {
      toast.error(err?.message || t.upload_error)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  return (
    <div>
      <Label>{label}</Label>
      {hint && <Text size="small" className="text-ui-fg-subtle mb-1">{hint}</Text>}

      {value && (
        <div
          className="mb-2 inline-flex items-center justify-center rounded border border-ui-border-base p-3"
          style={{ backgroundColor: previewBg }}
        >
          <img src={value} alt={label} className="max-h-20 max-w-[240px] object-contain" />
        </div>
      )}
        <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={onFile}
      />

      <div className="flex items-center gap-x-2">
        <Button
          variant="secondary"
          size="small"
          isLoading={uploading}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {value ? "Bild ersetzen" : "Bild hochladen"}
        </Button>

        {value && (
          <Button variant="transparent" size="small" disabled={disabled} onClick={() => onChange("")}>
            Entfernen
          </Button>
        )}
      </div>
    </div>
  )
}

const ThemeSettingsPage = () => {
  const [values, setValues] = useState(DEFAULTS);
  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).theme_settings;

  useEffect(() => {
    setLang(getClientLanguage())
  }, []);

  const { data, isLoading, refetch } = useQuery<{ theme_settings: ThemeSettings }>({
    queryKey: ["theme-settings"],
    queryFn: () => sdk.client.fetch("/admin/theme-settings", { method: "GET" }),
  })

  useEffect(() => {
    const s = data?.theme_settings
    if (!s) return
    setValues({
      theme_surface_bg: s.theme_surface_bg ?? DEFAULTS.theme_surface_bg,
      theme_border: s.theme_border ?? DEFAULTS.theme_border,
      theme_primary: s.theme_primary ?? DEFAULTS.theme_primary,
      theme_primary_hover: s.theme_primary_hover ?? DEFAULTS.theme_primary_hover,
      theme_button_text: s.theme_button_text ?? DEFAULTS.theme_button_text,
      theme_header_bg: s.theme_header_bg ?? DEFAULTS.theme_header_bg,
      theme_hero_bg: s.theme_hero_bg ?? DEFAULTS.theme_hero_bg,
      theme_page_bg: s.theme_page_bg ?? DEFAULTS.theme_page_bg,
      theme_page_text: s.theme_page_text ?? DEFAULTS.theme_page_text,
      theme_footer_bg: s.theme_footer_bg ?? DEFAULTS.theme_footer_bg,
      theme_logo_url: s.theme_logo_url ?? "",
      theme_hero_url: s.theme_hero_url ?? "",
      theme_hover_bg: s.theme_hover_bg ?? DEFAULTS.theme_hover_bg,
      theme_font: s.theme_font ?? DEFAULTS.theme_font,
    })

  }, [data])

  const set = (key: keyof typeof DEFAULTS) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }))

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async () =>
      sdk.client.fetch("/admin/theme-settings", { method: "POST", body: values }),
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

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          {t.intro}
        </Text>

        <div className="mt-6 grid gap-y-5">
          
          <Section title={t.group_basics} hint={t.group_basics_hint} defaultOpen>
            
            <ColorField label={t.page_bg} hint={t.page_bg_hint} value={values.theme_page_bg} onChange={set("theme_page_bg")} disabled={isLoading} />
            
            <ColorField label={t.page_text} hint={t.page_text_hint} value={values.theme_page_text} onChange={set("theme_page_text")} disabled={isLoading} />
           
            <ColorField label={t.surface_bg} hint={t.surface_bg_hint} value={values.theme_surface_bg} onChange={set("theme_surface_bg")} disabled={isLoading} />
            
            <ColorField label={t.border} hint={t.border_hint} value={values.theme_border} onChange={set("theme_border")} disabled={isLoading} />
            
            <ColorField label={t.hover_bg} hint={t.hover_bg_hint} value={values.theme_hover_bg} onChange={set("theme_hover_bg")} disabled={isLoading} />

          </Section>

          <Section title={t.group_actions} hint={t.group_actions_hint}>

            <ColorField label={t.primary} hint={t.primary_hint} value={values.theme_primary} onChange={set("theme_primary")} disabled={isLoading} />
            
            <ColorField label={t.primary_hover} hint={t.primary_hover_hint} value={values.theme_primary_hover} onChange={set("theme_primary_hover")} disabled={isLoading} />
            
            <ColorField label={t.button_text} value={values.theme_button_text} onChange={set("theme_button_text")} disabled={isLoading} />
          
          </Section>

          <Section title={t.group_frame}>

            <ColorField label={t.header_bg} value={values.theme_header_bg} onChange={set("theme_header_bg")} disabled={isLoading} />
            
            <ColorField label={t.footer_bg} value={values.theme_footer_bg} onChange={set("theme_footer_bg")} disabled={isLoading} />
         
          </Section>

          <Section title={t.group_home}>
            
            <ColorField label={t.hero_bg} hint={t.hero_bg_hint} value={values.theme_hero_bg} onChange={set("theme_hero_bg")} disabled={isLoading} />
          
          </Section>

          <Section title={t.group_media}>
           
            <ImageField label={t.logo} hint={t.logo_hint} value={values.theme_logo_url} onChange={set("theme_logo_url")}
              disabled={isLoading} previewBg={values.theme_header_bg} t={t} />
           
            <ImageField label={t.hero} hint={t.hero_hint} value={values.theme_hero_url} onChange={set("theme_hero_url")}
              disabled={isLoading} t={t} />
          
          </Section>

          
          <Section title={t.group_typo}>
            <div>
              <Label>{t.font}</Label>
              <Text size="small" className="text-ui-fg-subtle mb-1">{t.font_hint}</Text>
              <Select value={values.theme_font} onValueChange={(v) => set("theme_font")(v)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="default">{t.font_default}</Select.Item>
                  <Select.Item value="serif">{t.font_serif}</Select.Item>
                  <Select.Item value="sans">{t.font_sans}</Select.Item>
                  <Select.Item value="mono">{t.font_mono}</Select.Item>
                  <Select.Item value="rounded">{t.font_rounded}</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </Section>

          <div className="rounded-lg border border-ui-border-base p-4">
            <Text size="small" className="text-ui-fg-subtle mb-3">{t.preview}</Text>
            <div className="rounded-md overflow-hidden border border-ui-border-base">
              <div className="h-10" style={{ backgroundColor: values.theme_header_bg }} />
                <div className="p-6 flex justify-center" style={{ backgroundColor: values.theme_hero_bg }}>
                <span
                  className="px-4 py-2 rounded-md text-sm"
                  style={{ backgroundColor: values.theme_primary, color: values.theme_button_text }}
                >
                  {t.preview_button}
                </span>
              </div>
              <div className="h-10" style={{ backgroundColor: values.theme_footer_bg }} />
            </div>
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
  label: getMessages(getClientLanguage()).theme_settings.menu,
  icon: CubeSolid,
})

export default ThemeSettingsPage;
