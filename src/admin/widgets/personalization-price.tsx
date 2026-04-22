import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Input, Button, toast } from "@medusajs/ui";
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../lib/sdk";

type PersonalizationPriceResponse = {
  dimension_price_factor: number | null
}

const PersonalizationPriceWidget = ({
  data: product,
}: DetailWidgetProps<AdminProduct>) => {
  const isPersonalized = Boolean(
    (product.metadata as any)?.is_personalized
  )

  if (!isPersonalized) 
  {
    return <></>
  }

  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const { data, isLoading } = useQuery<PersonalizationPriceResponse>({
    queryKey: ["personalization-price", product.id],
    queryFn: async () => {
      return sdk.client.fetch<PersonalizationPriceResponse>(
        `/admin/products/${product.id}/personalization-price`
      )
    },
  })

  useEffect(() => {
    const fromApi = data?.dimension_price_factor
    const fromProduct = (product.metadata as any)?.dimension_price_factor

    const source =
      typeof fromApi === "number" && Number.isFinite(fromApi)
        ? fromApi
        : typeof fromProduct === "number"
        ? fromProduct
        : typeof fromProduct === "string"
        ? Number(fromProduct)
        : undefined

    if (typeof source === "number" && Number.isFinite(source)) {
      setValue(source.toString())
    }
  }, [data, product])

  const mutation = useMutation({
    mutationFn: async (factor: number) => {
      return sdk.client.fetch<PersonalizationPriceResponse>(
        `/admin/products/${product.id}/personalization-price`,
        {
          method: "POST",
          body: {
            dimension_price_factor: factor,
          },
        }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["personalization-price", product.id],
      })
      toast.success("Price factor saved")
    },
    onError: () => {
      toast.error("Price factor could not be saved.")
    },
  })

  const disabled = isLoading || mutation.isPending;

  const handleSave = () => {
    const numeric = Number(value.replace(",", "."))
    if (!Number.isFinite(numeric) || numeric < 0) {
      toast.error("Please enter a valid, non-negative factor.")
      return;
    }
    mutation.mutate(numeric);
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Heading level="h2">
          Personalisierungs-Preisfaktor
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Lege fest, welcher Preis in Euro pro cm² bei personalisierten
          Produkten verwendet wird. Höhe und Breite werden in Millimetern
          angegeben; intern wird die Fläche in cm² umgerechnet und mit
          diesem Faktor multipliziert und zum Basispreis addiert.
        </Text>
        <div className="flex items-center gap-x-3 mt-2">
          <div className="flex flex-col gap-y-1">
            <Text size="small">Preisfaktor</Text>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="z.B. 0.01"
              className="w-[160px]"
              disabled={disabled}
            />
          </div>
          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            isLoading={mutation.isPending}
            disabled={disabled}
          >
            Speichern
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default PersonalizationPriceWidget;