import { useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Button } from "@medusajs/ui";
import type { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { sdk } from "../lib/sdk";

type DuplicateResponse = {
  product: {
    id: string
    title: string
    handle?: string
  }
  message?: string
}

const DuplicateProductWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {

  const [created, setCreated] = useState<DuplicateResponse["product"] | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      return sdk.client.fetch<DuplicateResponse>(`/admin/products/${product.id}/duplicate`,
        {
          method: "POST",
          body: {},
        }
      )
    },
    onSuccess: (data) => {
      setCreated(data.product)
    },
  })

  const errorDetails = (() => {
    const err: any = mutation.error
     const status = err?.response?.status ?? err?.status
    const data = err?.response?.data ?? err?.data

    const message =
      (typeof data?.message === "string" && data.message) ||
      (typeof err?.message === "string" && err.message) ||
      (typeof err === "string" ? err : "")

    const extra = data && typeof data === "object" ? JSON.stringify(data) : null

    return {
      status: typeof status === "number" ? status : null,
      message: message || null,
      extra,
    }
  })()

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Heading level="h2">Produkt duplizieren</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Erstellt eine Kopie dieses Produkts (inkl. Optionen/Varianten).
        </Text>

        <div className="flex items-center gap-x-3">
          <Button
            type="button"
            variant="secondary"
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Duplizieren
          </Button>

          {created?.id && (
            <Link to={`/products/${created.id}`} className="text-ui-fg-interactive">
              Zum neuen Produkt
            </Link>
          )}
        </div>

        {mutation.isError && (
          <Text size="small" className="text-ui-fg-error">
             Duplizieren fehlgeschlagen
            {errorDetails.status != null ? ` (HTTP ${errorDetails.status})` : ""}
            {errorDetails.message ? `: ${errorDetails.message}` : "."}
            {errorDetails.extra ? ` ${errorDetails.extra}` : ""}
          </Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default DuplicateProductWidget;