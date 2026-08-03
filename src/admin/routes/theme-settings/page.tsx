import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../../lib/sdk";

type ThemeSettings = {
  theme_primary: string | null
  theme_primary_hover: string | null
  theme_button_text: string | null
  theme_header_bg: string | null
  theme_footer_bg: string | null
  theme_logo_url: string | null
  theme_hero_url: string | null
}

const DEFAULTS = {
  theme_primary: "#431407",
  theme_primary_hover: "#7c2d12",
  theme_button_text: "#ffffff",
  theme_header_bg: "#431407",
  theme_footer_bg: "#431407",
  theme_logo_url: "",
  theme_hero_url: "",
}

const ColorField = ({
  label, hint, value, onChange, disabled, previewBg,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  previewBg?: string
}) => {
  const [uploading, setUploading] = useState(false)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { files } = await sdk.admin.upload.create({ files: [file] })
      const url = files?.[0]?.url
      if (!url) throw new Error("Upload lieferte keine Adresse zurück")
      onChange(url)
      toast.success("Bild hochgeladen – jetzt noch speichern")
    } catch (err: any) {
      toast.error(err?.message || "Upload fehlgeschlagen")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }
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
  label, hint, value, onChange, disabled, previewBg,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  previewBg?: string
}) => {
  const [uploading, setUploading] = useState(false)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { files } = await sdk.admin.upload.create({ files: [file] })
      const url = files?.[0]?.url
      if (!url) throw new Error("Upload lieferte keine Adresse zurück")
      onChange(url)
      toast.success("Bild hochgeladen – jetzt noch speichern")
    } catch (err: any) {
      toast.error(err?.message || "Upload fehlgeschlagen")
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

      <div className="flex items-center gap-x-2">
        <label className="inline-flex">
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            disabled={disabled || uploading}
            onChange={onFile}
          />
          <Button asChild variant="secondary" size="small" isLoading={uploading}>
            <span className="cursor-pointer">{value ? "Bild ersetzen" : "Bild hochladen"}</span>
          </Button>
        </label>
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
  const [values, setValues] = useState(DEFAULTS)

  const { data, isLoading, refetch } = useQuery<{ theme_settings: ThemeSettings }>({
    queryKey: ["theme-settings"],
    queryFn: () => sdk.client.fetch("/admin/theme-settings", { method: "GET" }),
  })

  useEffect(() => {
    const s = data?.theme_settings
    if (!s) return
    setValues({
      theme_primary: s.theme_primary ?? DEFAULTS.theme_primary,
      theme_primary_hover: s.theme_primary_hover ?? DEFAULTS.theme_primary_hover,
      theme_button_text: s.theme_button_text ?? DEFAULTS.theme_button_text,
      theme_header_bg: s.theme_header_bg ?? DEFAULTS.theme_header_bg,
      theme_footer_bg: s.theme_footer_bg ?? DEFAULTS.theme_footer_bg,
      theme_logo_url: s.theme_logo_url ?? "",
      theme_hero_url: s.theme_hero_url ?? "",
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
      toast.success("Design gespeichert")
      await refetch()
    } catch (e: any) {
      toast.error(e?.message || "Speichern fehlgeschlagen")
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">Design</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          Farben des Shops. Änderungen sind nach dem Speichern sofort im Shop sichtbar.
        </Text>

        <div className="mt-6 grid gap-y-5">
          <ColorField
            label="Hauptfarbe"
            hint="Buttons, Aktionen, Hervorhebungen"
            value={values.theme_primary}
            onChange={set("theme_primary")}
            disabled={isLoading}
          />
          <ColorField
            label="Hauptfarbe (Mouseover)"
            hint="Farbe, wenn die Maus über einem Button steht"
            value={values.theme_primary_hover}
            onChange={set("theme_primary_hover")}
            disabled={isLoading}
          />
          <ColorField
            label="Schriftfarbe auf Buttons"
            value={values.theme_button_text}
            onChange={set("theme_button_text")}
            disabled={isLoading}
          />
          <ColorField
            label="Kopfzeile Hintergrund"
            value={values.theme_header_bg}
            onChange={set("theme_header_bg")}
            disabled={isLoading}
          />
          <ColorField
            label="Fußzeile Hintergrund"
            value={values.theme_footer_bg}
            onChange={set("theme_footer_bg")}
            disabled={isLoading}
          />

                    <ImageField
            label="Logo"
            hint="Wird in Kopf- und Fußzeile angezeigt. Ohne Logo erscheint der Shop-Name als Text. Am besten PNG oder SVG mit transparentem Hintergrund."
            value={values.theme_logo_url}
            onChange={set("theme_logo_url")}
            disabled={isLoading}
            previewBg={values.theme_header_bg}
          />

          <ImageField
            label="Startseiten-Bild"
            hint="Das große Bild auf der Startseite. Ohne eigenes Bild wird das Standardbild verwendet."
            value={values.theme_hero_url}
            onChange={set("theme_hero_url")}
            disabled={isLoading}
          />

          <div className="rounded-lg border border-ui-border-base p-4">
            <Text size="small" className="text-ui-fg-subtle mb-3">Vorschau</Text>
            <div className="rounded-md overflow-hidden border border-ui-border-base">
              <div className="h-10" style={{ backgroundColor: values.theme_header_bg }} />
              <div className="p-6 bg-ui-bg-base flex justify-center">
                <span
                  className="px-4 py-2 rounded-md text-sm"
                  style={{ backgroundColor: values.theme_primary, color: values.theme_button_text }}
                >
                  In den Warenkorb
                </span>
              </div>
              <div className="h-10" style={{ backgroundColor: values.theme_footer_bg }} />
            </div>
          </div>

          <div className="flex justify-end gap-x-2">
            <Button variant="secondary" disabled={isPending} onClick={() => refetch()}>
              Zurücksetzen
            </Button>
            <Button variant="primary" isLoading={isPending} onClick={onSave}>
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Design",
  icon: CubeSolid,
})

export default ThemeSettingsPage;
