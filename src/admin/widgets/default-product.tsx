import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"

type DefaultProductResponse = {
  default_product_id: string | null
}

type AdminProductListResponse = {
  products: {
    id: string
    title: string
  }[]
}

const DefaultProductWidget = () => {
  const queryClient = useQueryClient()

  const { data: defaultData, isLoading: isLoadingDefault } = useQuery({
    queryKey: ["default-product"],
    queryFn: async () => {
      return sdk.client.fetch<DefaultProductResponse>("/admin/default-product")
    },
  })

  const { data: productsData, isLoading: isLoadingProducts } =
    useQuery<AdminProductListResponse>({
      queryKey: ["admin-products-simple"],
      queryFn: async () => {
        return sdk.admin.product.list({
          limit: 50,
          fields: "id,title",
        }) as Promise<AdminProductListResponse>
      },
    })

  const mutation = useMutation({
    mutationFn: async (productId: string) => {
      return sdk.client.fetch<DefaultProductResponse>("/admin/default-product", {
        method: "POST",
        body: {
          product_id: productId,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["default-product"] })
    },
  })

  const selectedId = defaultData?.default_product_id ?? ""

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (!value) {
      return
    }
    mutation.mutate(value)
  }

  const products = productsData?.products ?? []

  const disabled =
    isLoadingDefault || isLoadingProducts || mutation.isPending || !products.length

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Heading level="h2">Standard-Produkt</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Wähle ein Produkt, das z.B. im Store als Default hervorgehoben werden soll.
        </Text>
        <div className="flex items-center gap-x-4">
          <select
            title="Wähle ein Standard-Produkt"
            className="border border-ui-border-subtle rounded px-2 py-1 text-sm min-w-[240px]"
            value={selectedId}
            onChange={handleChange}
            disabled={disabled}
          >
            <option value="">
              {isLoadingProducts
                ? "Produkte werden geladen..."
                : "Produkt auswählen"}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
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
  zone: "product.list.before",
})

export default DefaultProductWidget;