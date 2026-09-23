import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types";
import { Container, Heading, Button, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";

import { getClientLanguage } from "../lib/i18n";
import { getMessages, type Lang } from "../lib/messages";

/**
 * Nur die Schlüssel in Anzeigereihenfolge. Die Namen stehen in den
 * Sprachdateien unter email_templates.production_status_update.statuses –
 * dieselbe Quelle, aus der die Status-Mail ihre Bezeichnungen zieht.
 *
 * Die Reihenfolge hier festzulegen ist Absicht: Auf die Reihenfolge der
 * Einträge in einer JSON-Datei sollte man sich nicht verlassen.
 */
const STATUS_KEYS = [
  "received",
  "paid",
  "in_design",
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
  "cancelled",
];

const OrderProductionWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const [lang, setLang] = useState<Lang>(getClientLanguage);
  const t = getMessages(lang);

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const [status, setStatus] = useState("received");
  const [loading, setLoading] = useState(false);

  const statusLabels = t.email_templates.production_status_update
    .statuses as Record<string, string>;

  useEffect(() => {
    fetch(`/admin/order-production/${order.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.status) setStatus(d.status);
      })
      .catch(() => {});
  }, [order.id]);

  const save = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/admin/order-production/${order.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        // Statuscode und Servermeldung durchreichen. Sonst sieht eine
        // abgelaufene Anmeldung (401) genauso aus wie ein echter Fehler.
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.message || `Fehler ${res.status}`);
      }

      toast.success(t.order_production.save_info);
    } catch (e: any) {
      toast.error(e?.message || t.order_production.save_error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t.order_production.title}</Heading>
      </div>
      <div className="flex items-center gap-3 px-6 py-4">
        <select
          title={t.order_production.select_title}
          className="border rounded-md px-3 py-1.5 text-sm bg-ui-bg-field"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_KEYS.map((key) => (
            <option key={key} value={key}>
              {statusLabels[key] ?? key}
            </option>
          ))}
        </select>
        <Button size="small" onClick={save} isLoading={loading}>
          {t.order_production.save}
        </Button>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.after" });
export default OrderProductionWidget;
