import { useEffect, useMemo, useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui";
import type { AdminProductVariant, DetailWidgetProps} from "@medusajs/framework/types";
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getClientLanguage } from "../lib/i18n";
import { getMessages, type Lang } from "../lib/messages";

type UpdateVariantResponse = { variant?: AdminProductVariant ;}

const VariantThicknessWidget = ({ data: variant }: DetailWidgetProps<AdminProductVariant>) => {

    const [lang, setLang] = useState<Lang>("de")
    const t = getMessages(lang)

    useEffect(() => {
    setLang(getClientLanguage())
    }, [])

    const initial = useMemo(() => {
    const raw = (variant.metadata as any)?.thickness ?? (variant.metadata as any)?.thickness_mm;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? String(n) : "";
  }, [variant.metadata])

    const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial)
  }, [initial])

   const queryClient = useQueryClient();

   const mutation = useMutation({
    mutationFn: async (payload: { thickness?: number }) => {
      const nextMetadata: Record<string, any> = { ...(variant.metadata ?? {}) };

    if (payload.thickness == null) 
    {
        delete nextMetadata.thickness;
      } else {
        nextMetadata.thickness = payload.thickness;
      }

      const productId =
        (variant as any)?.product_id ??
        (variant as any)?.product?.id ??
        (variant as any)?.productId;

    if (!productId) {
        throw new Error("Missing product_id on variant");
      }

      const res = await fetch(
        `/admin/products/${productId}/variants/${variant.id}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: nextMetadata }),
        }
    );

    if (!res.ok) 
    {
        throw new Error(`Request failed with status ${res.status}`);
      }

      return (await res.json()) as UpdateVariantResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(t.variant_thickness.saved);
    },
    onError: () => {
      toast.error(t.variant_thickness.save_failed);
    },
  })

  const handleSave = () => {

    const trimmed = value.trim();

    if (trimmed === "") 
    {
      mutation.mutate({ thickness: undefined });
      return;
    }

    const numeric = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric < 0) 
    {
      toast.error(t.variant_thickness.invalid);
      return;
    }

    mutation.mutate({ thickness: numeric })
  }

    return(
        <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Heading level="h2">{t.variant_thickness.heading}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t.variant_thickness.description}
        </Text>

        <div className="flex items-end gap-x-3 mt-2">
          <div className="flex flex-col gap-y-1">
            <Text size="small">{t.variant_thickness.label}</Text>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={value}
              placeholder={t.variant_thickness.placeholder}
              onChange={(e) => setValue(e.target.value)}
              className="w-[160px]"
              disabled={mutation.isPending}
            />
          </div>

          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            isLoading={mutation.isPending}
            disabled={mutation.isPending}
          >
            {t.variant_thickness.save}
          </Button>
        </div>
      </div>
    </Container>
    )
}

export const config = defineWidgetConfig({
  zone: "product_variant.details.after",
})


export default VariantThicknessWidget;