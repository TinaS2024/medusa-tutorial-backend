import { useState, useEffect } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Input, Button, Badge, toast } from "@medusajs/ui";
import { DetailWidgetProps, AdminCustomer } from "@medusajs/framework/types";
import { useMutation } from "@tanstack/react-query";
import { sdk } from "../lib/sdk";

/** Antwort der Prüf-Route GET /admin/erp/customer/:gpeId (bereits vorhanden). */
type GpeCustomerPreview = {
  id: string
  company: string | null
  email: string | null
  language: string | null
  addresses: {
    line1?: string
    postalCode?: string
    city?: string
    country?: string
  }[]
  designerDiscount: string | number | null;
}

/** aktuelle gpe_id aus den Metadaten als String (oder "") */
const readGpeId = (customer: AdminCustomer): string => {
  const raw = (customer.metadata as any)?.gpe_id;
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
}

const CustomerGpeIdWidget = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => 
{
  // "linked" = die gespeicherte ID (für das Badge). Wird lokal nachgeführt,
  // damit die Anzeige sofort stimmt, ohne auf ein Neuladen der Seite zu warten.
  const [linked, setLinked] = useState(readGpeId(customer));
  const [value, setValue] = useState(readGpeId(customer));
  const [preview, setPreview] = useState<GpeCustomerPreview | null>(null);

  // Beim Wechsel auf einen anderen Kunden alles zurücksetzen.
  useEffect(() => {
    const current = readGpeId(customer)
    setLinked(current)
    setValue(current)
    setPreview(null)
  }, [customer.id])

  // Prüfen: GPE-Kunde zur eingegebenen ID laden – nur lesen, nichts speichern.
  const check = useMutation({
    mutationFn: async (gpeId: string) =>
      sdk.client.fetch<GpeCustomerPreview>(
        `/admin/erp/customer/${encodeURIComponent(gpeId)}`
      ),
    onSuccess: (data) => {
      setPreview(data)
      toast.success("GPE-Kunde gefunden.")
    },
    onError: () => {
      setPreview(null)
      toast.error("Kein GPE-Kunde mit dieser ID gefunden (oder GPE nicht erreichbar).")
    },
  })

  // Speichern: gpe_id in customer.metadata schreiben. Bestehende Metadaten
  // bleiben erhalten (spread), nur gpe_id wird gesetzt bzw. bei leerer Eingabe
  // auf null gesetzt (= Verknüpfung entfernt).
  const save = useMutation({
    mutationFn: async (gpeId: string | null) =>
      sdk.client.fetch(`/admin/customers/${customer.id}`, {
        method: "POST",
        body: { metadata: { ...(customer.metadata ?? {}), gpe_id: gpeId } },
      }),
    onSuccess: (_res, gpeId) => {
      setLinked(gpeId ?? "")
      toast.success(
        gpeId ? "GPE-Kunden-ID gespeichert." : "Verknüpfung entfernt."
      )
    },
    onError: () => {
      toast.error("GPE-Kunden-ID konnte nicht gespeichert werden.")
    },
  })

  const trimmed = value.trim()
  const busy = check.isPending || save.isPending

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex items-center justify-between">
          <Heading level="h2">GPE-Kunde</Heading>
          {linked ? (
            <Badge color="green">verknüpft: {linked}</Badge>
          ) : (
            <Badge color="grey">nicht verknüpft</Badge>
          )}
        </div>

        <Text size="small" className="text-ui-fg-subtle">
          Verknüpft diesen Shop-Kunden mit einem bestehenden GPE-Kunden. Erst die
          GPE-Kunden-ID eingeben und <b>Prüfen</b>, um den richtigen Kunden zu
          bestätigen, dann <b>Speichern</b>. Die ID steuert den Kundenrabatt und
          später den Bestellversand an GPE.
        </Text>

        <div className="flex items-end gap-x-3">
          <div className="flex flex-col gap-y-1">
            <Text size="small">GPE-Kunden-ID</Text>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="z.B. 10-000-943"
              className="w-[200px]"
              disabled={busy}
            />
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => check.mutate(trimmed)}
            isLoading={check.isPending}
            disabled={busy || trimmed === ""}
          >
            Prüfen
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={() => save.mutate(trimmed === "" ? null : trimmed)}
            isLoading={save.isPending}
            disabled={busy}
          >
            Speichern
          </Button>
        </div>

        {preview && (
          <div className="rounded-lg border p-3 mt-1 flex flex-col gap-y-1">
            <Text size="small" weight="plus">Gefundener GPE-Kunde</Text>
            <Text size="small" className="text-ui-fg-subtle">
              Firma: {preview.company ?? "—"}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              E-Mail: {preview.email ?? "—"}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              Adresse:{" "}
              {preview.addresses?.[0]
                ? [
                    preview.addresses[0].line1,
                    preview.addresses[0].postalCode,
                    preview.addresses[0].city,
                    preview.addresses[0].country,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : "—"}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              Kundenrabatt: {preview.designerDiscount ?? "—"}
            </Text>
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default CustomerGpeIdWidget;
