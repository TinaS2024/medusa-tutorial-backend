import { useEffect, useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui";
import { DetailWidgetProps, AdminCustomer } from "@medusajs/framework/types";
import { useMutation } from "@tanstack/react-query";
import { sdk } from "../lib/sdk";
import { getClientLanguage } from "../lib/i18n";
import { getMessages, type Lang } from "../lib/messages";

/** aktuelle Kundennummer aus den Metadaten als String (oder "") */
const readCustomerNumber = (customer: AdminCustomer): string => {
  const raw = (customer.metadata as any)?.customer_number;
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
}

const CustomerNumberWidget = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => 
{
  const [lang, setLang] = useState<Lang>(getClientLanguage);
  const t = getMessages(lang).customer_number;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  // Lokal nachgeführt, damit die Anzeige sofort stimmt, ohne Neuladen.
  const [current, setCurrent] = useState(readCustomerNumber(customer));

  useEffect(() => {
    setCurrent(readCustomerNumber(customer));
  }, [customer.id]);

  // Vergeben: aus dem Nummernkreis ("series") oder die GPE-Nummer ("gpe").
  // Die Prüfungen (schon vorhanden? GPE verknüpft?) macht der Server.
  const assign = useMutation({
    mutationFn: (source: "series" | "gpe") =>
      sdk.client.fetch<{ customer_number: string }>(
        `/admin/customer-number/${customer.id}`,
        { method: "POST", body: { source } }
      ),
    onSuccess: (data) => {
      setCurrent(data.customer_number);
      toast.success(t.assign_ok);
    },
    onError: (e: any) => {
      toast.error(e?.message || t.failed);
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/customer-number/${customer.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setCurrent("");
      toast.success(t.remove_ok);
    },
    onError: (e: any) => {
      toast.error(e?.message || t.failed);
    },
  });

  const busy = assign.isPending || remove.isPending;

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex items-center justify-between">
          <Heading level="h2">{t.heading}</Heading>
          {current ? (
            <Badge color="green">{current}</Badge>
          ) : (
            <Badge color="grey">{t.none}</Badge>
          )}
        </div>

        <Text size="small" className="text-ui-fg-subtle">
          {t.description}
        </Text>

        <div className="flex gap-x-3">
          {current ? (
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                if (window.confirm(t.remove_confirm)) remove.mutate();
              }}
              isLoading={remove.isPending}
              disabled={busy}
            >
              {t.remove}
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="small"
                onClick={() => assign.mutate("series")}
                isLoading={assign.isPending && assign.variables === "series"}
                disabled={busy}
              >
                {t.assign}
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={() => assign.mutate("gpe")}
                isLoading={assign.isPending && assign.variables === "gpe"}
                disabled={busy}
              >
                {t.take_gpe}
              </Button>
            </>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default CustomerNumberWidget;
