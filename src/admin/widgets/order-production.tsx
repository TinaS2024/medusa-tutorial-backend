import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types";
import { Container, Heading, Button, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";

const STATUSES = [
  { value: "received", label: "Bestellung eingegangen" },
  { value: "paid", label: "Bezahlt" },
  { value: "in_design", label: "In Gestaltung" },
  { value: "in_production", label: "In Produktion" },
  { value: "ready_to_ship", label: "Versandbereit" },
  { value: "shipped", label: "Versendet" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "cancelled", label: "Storniert" },
];

const OrderProductionWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const [status, setStatus] = useState("received");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/admin/order-production/${order.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d?.status) setStatus(d.status); })
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
      if (!res.ok) throw new Error();
      toast.success("Produktionsstatus gespeichert");
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Produktionsstatus</Heading>
      </div>
      <div className="flex items-center gap-3 px-6 py-4">
        <select
        title="Wähle einen Status"
          className="border rounded-md px-3 py-1.5 text-sm bg-ui-bg-field"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <Button size="small" onClick={save} isLoading={loading}>Speichern</Button>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.after" });
export default OrderProductionWidget;
