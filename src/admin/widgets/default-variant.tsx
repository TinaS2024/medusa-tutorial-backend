import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text } from "@medusajs/ui";
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChangeEvent } from "react";
import { sdk } from "../lib/sdk";

type DefaultVariantResponse = {
  default_variant_id: string | null
}

type AdminProductWithVariantsResponse = {
  product: AdminProduct
}

const DefaultVariantWidget = ({
  data: product,
}: DetailWidgetProps<AdminProduct>) => {
  const queryClient = useQueryClient()

  const { data: defaultData, isLoading: isLoadingDefault } = useQuery({
    queryKey: ["default-variant", product.id],
    queryFn: async () =>
      sdk.client.fetch<DefaultVariantResponse>(
        `/admin/products/${product.id}/default-variant`
      ),
  })

   const { data: fullProductData, isLoading: isLoadingProduct } =
    useQuery<AdminProductWithVariantsResponse>({
      queryKey: ["product-with-variants", product.id],
      queryFn: async () =>
        sdk.admin.product.retrieve(product.id, {
          fields: "+variants.*",
        }) as Promise<AdminProductWithVariantsResponse>,
    })

  const mutation = useMutation({
    mutationFn: async (variantId: string) =>
      sdk.client.fetch<DefaultVariantResponse>(
        `/admin/products/${product.id}/default-variant`,
        {
          method: "POST",
          body: { variant_id: variantId },
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["default-variant", product.id],
      })
    },
  })

   const variants = fullProductData?.product.variants ?? [];

  
  if (!variants.length) {
    // Produkt ohne Varianten -> Widget nicht anzeigen
    return <></>
  }

  const selectedId = defaultData?.default_variant_id ?? "";

  const disabled = isLoadingDefault || isLoadingProduct || mutation.isPending || !variants.length;

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (!value) {
      return
    }
    mutation.mutate(value)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Heading level="h2">Standard-Variante</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Wähle die Variante, die als Standard für dieses Produkt verwendet
          werden soll (z.B. für dein Frontend).
        </Text>

        <div className="flex items-center gap-x-4">
          <select
            title="Wähle eine Standard-Variante"
            className="border border-ui-border-subtle rounded px-2 py-1 text-sm min-w-[240px]"
            value={selectedId}
            onChange={handleChange}
            disabled={disabled}
          >
            <option value="">
              {isLoadingDefault
                ? "Standard-Variante wird geladen..."
                : "Variante auswählen"}
            </option>
            {variants.map((v) => {
              const label = v.title || v.sku || v.id
              return (
                <option key={v.id} value={v.id}>
                  {label}
                </option>
              )
            })}
          </select>

          {mutation.isPending && (
            <Text size="small" className="text-ui-fg-subtle">
              Speichere...
            </Text>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default DefaultVariantWidget