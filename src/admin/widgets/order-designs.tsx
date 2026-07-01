import { useState, useEffect } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text } from "@medusajs/ui";
import { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";

import { getClientLanguage } from "../lib/i18n";
import { getMessages, type Lang } from "../lib/messages";

const safeDecode = (v?: string) => {
  if (!v) return undefined;
  try { return decodeURIComponent(v); } catch { return v; }
};

const OrderDesignsWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => 
{
    const [lang, setLang] = useState<Lang>("de");
    const t = getMessages(lang);
    
    useEffect(() => {
        setLang(getClientLanguage())
      }, []);

  const items = order.items.filter((item) => item.metadata?.design_image);

  if (!items.length) {
    return null;
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t.designs.cus_design}</Heading>
      </div>

      <div className="divide-y">
        {items.map((item) => {
          const png = safeDecode(item.metadata?.design_image as string | undefined);
          const svg = safeDecode(item.metadata?.svg_url as string | undefined);

          return (
            <div key={item.id} className="flex gap-4 px-6 py-4">
              {png && (
                <img
                  src={png}
                  alt={item.title}
                  className="h-24 w-24 object-contain rounded border border-ui-border bg-ui-bg-subtle"
                />
              )}
              <div className="flex flex-col gap-1">
                <Text size="small" weight="plus">{item.title}</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {(item.metadata?.width as number) ?? "?"} × {(item.metadata?.height as number) ?? "?"} mm
                </Text>
                {svg && (
                  <a
                    href={svg}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ui-fg-interactive text-sm underline"
                  >
                    SVG (Produktionsdatei) öffnen
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default OrderDesignsWidget;
