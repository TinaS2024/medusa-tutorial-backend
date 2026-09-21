import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types";
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui";
import { useEffect, useState } from "react";

import { getClientLanguage } from "../lib/i18n";
import { getMessages, type Lang } from "../lib/messages";

/** Eine Position aus der eingefrorenen Kopie einer Rechnung. */
type SnapshotLine = {
  position: number;
  title: string;
  quantity: number;
  gross: number;
};

type Invoice = {
  id: string;
  number: string;
  type: string;
  issued_at: string;
  total_gross: number | string;
  currency_code: string;
  pdf_filename: string | null;
  mailed_at: string | null;
  corrects_invoice_id: string | null;
  snapshot?: {
    data?: { lines: SnapshotLine[]; shipping: SnapshotLine | null };
    credited?: { position: number; quantity: number }[];
  };
};

/** Sprachkürzel zu vollem Gebietsschema – für Datums- und Geldformate. */
const LOCALES: Record<string, string> = {
  de: "de-DE",
  en: "en-GB",
  fr: "fr-FR",
  nl: "nl-NL",
};

/** Setzt {platzhalter} in einem Text ein. */
const interpolate = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match
  );

const OrderInvoiceWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang);

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const [correcting, setCorrecting] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/admin/orders/${order.id}/invoices`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setInvoices(d?.invoices ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [order.id]);

  const locale = LOCALES[lang] ?? "de-DE";

  const money = (value: number | string, currency: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value));

  const day = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));

  const typeLabel = (type: string) => {
    if (type === "cancellation") return t.invoices.type_cancellation;
    if (type === "credit_note") return t.invoices.type_credit_note;
    return t.invoices.type_invoice;
  };

  /** Die Positionen einer Rechnung – Versand zählt als eine davon. */
  const linesOf = (invoice: Invoice): SnapshotLine[] => {
    const data = invoice.snapshot?.data;
    if (!data) return [];
    return data.shipping ? [...data.lines, data.shipping] : data.lines;
  };

  /** Wie viel wurde je Position schon korrigiert? */
  const creditedFor = (invoiceId: string) => {
    const map = new Map<number, number>();

    for (const other of invoices) {
      if (other.type !== "credit_note") continue;
      if (other.corrects_invoice_id !== invoiceId) continue;

      for (const entry of other.snapshot?.credited ?? []) {
        map.set(entry.position, (map.get(entry.position) ?? 0) + entry.quantity);
      }
    }

    return map;
  };

  /** Meldung aus dem Backend-Ergebnis bauen. */
  const mailToast = (sent: boolean, reason: string | undefined, ok: string, fail: string) =>
    sent
      ? toast.success(ok)
      : toast.success(interpolate(fail, { reason: reason ?? t.invoices.unknown_reason }));

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/admin/orders/${order.id}/invoices`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();

      const data = await res.json().catch(() => ({} as any));
      mailToast(
        Boolean(data?.mail?.sent),
        data?.mail?.reason,
        t.invoices.invoice_created_sent,
        t.invoices.invoice_created_nomail
      );
      load();
    } catch {
      toast.error(t.invoices.create_failed);
    } finally {
      setCreating(false);
    }
  };

  const cancel = async (invoice: Invoice) => {
    const ok = window.confirm(
      interpolate(t.invoices.confirm_cancel, { number: invoice.number })
    );

    if (!ok) return;

    setCancelling(invoice.id);
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}/cancel`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.message || `Fehler ${res.status}`);
      }

      const data = await res.json().catch(() => ({} as any));
      mailToast(
        Boolean(data?.mail?.sent),
        data?.mail?.reason,
        t.invoices.cancel_created_sent,
        t.invoices.cancel_created_nomail
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || t.invoices.cancel_failed);
    } finally {
      setCancelling(null);
    }
  };

  const resend = async (invoice: Invoice) => {
    setSending(invoice.id);
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}/send`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.message || `Fehler ${res.status}`);
      }

      toast.success(t.invoices.sent_ok);
      load();
    } catch (e: any) {
      toast.error(e?.message || t.invoices.send_failed);
    } finally {
      setSending(null);
    }
  };

  const submitCorrection = async (invoice: Invoice) => {
    const items = Object.entries(amounts)
      .map(([position, value]) => ({
        position: Number(position),
        quantity: Number(value),
      }))
      .filter((i) => i.quantity > 0);

    if (!items.length) {
      toast.error(t.invoices.select_quantity);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}/credit-note`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.message || `Fehler ${res.status}`);
      }

      const data = await res.json().catch(() => ({} as any));
      mailToast(
        Boolean(data?.mail?.sent),
        data?.mail?.reason,
        t.invoices.correction_created_sent,
        t.invoices.correction_created_nomail
      );
      setCorrecting(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || t.invoices.correction_failed);
    } finally {
      setSaving(false);
    }
  };

  const cancelledIds = new Set(
    invoices.filter((i) => i.type === "cancellation").map((i) => i.corrects_invoice_id)
  );

  const hasOpenInvoice = invoices.some(
    (i) => i.type === "invoice" && !cancelledIds.has(i.id)
  );

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t.invoices.title}</Heading>
        <div className="flex items-center gap-x-2">
          <Button size="small" variant="secondary" onClick={load} disabled={loading}>
            {t.invoices.reload}
          </Button>
          {!loading && !hasOpenInvoice ? (
            <Button size="small" onClick={create} isLoading={creating}>
              {t.invoices.create}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-6 pb-4">
        {loading ? (
          <Text className="text-ui-fg-subtle">{t.invoices.loading}</Text>
        ) : invoices.length === 0 ? (
          <Text className="text-ui-fg-subtle">{t.invoices.none_yet}</Text>
        ) : (
          <div className="grid gap-y-3">
            {invoices.map((invoice) => {
              const cancelledBy = invoices.find(
                (other) =>
                  other.type === "cancellation" &&
                  other.corrects_invoice_id === invoice.id
              );

              const credited = creditedFor(invoice.id);
              const canCorrect = invoice.type === "invoice" && !cancelledBy;

              return (
                <div key={invoice.id} className="flex flex-col gap-y-2">
                  <div className="flex items-center justify-between gap-x-4">
                    <div>
                      <Text weight="plus">
                        {typeLabel(invoice.type)} {invoice.number}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        {day(invoice.issued_at)} ·{" "}
                        {money(invoice.total_gross, invoice.currency_code)}
                        {invoice.mailed_at
                          ? ` · ${t.invoices.mailed_on} ${day(invoice.mailed_at)}`
                          : ` · ${t.invoices.not_sent}`}
                        {cancelledBy
                          ? ` · ${t.invoices.cancelled_by} ${cancelledBy.number}`
                          : ""}
                      </Text>
                    </div>

                    <div className="flex items-center gap-x-2">
                      {canCorrect ? (
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => {
                            setCorrecting(invoice.id);
                            setAmounts({});
                          }}
                        >
                          {t.invoices.correct}
                        </Button>
                      ) : null}

                      {canCorrect ? (
                        <Button
                          size="small"
                          variant="danger"
                          onClick={() => cancel(invoice)}
                          disabled={cancelling === invoice.id}
                        >
                          {t.invoices.cancel}
                        </Button>
                      ) : null}

                      {invoice.pdf_filename ? (
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => resend(invoice)}
                          disabled={sending === invoice.id}
                        >
                          {invoice.mailed_at ? t.invoices.resend : t.invoices.send}
                        </Button>
                      ) : null}

                      {invoice.pdf_filename ? (
                        <a
                          href={`/admin/invoices/${invoice.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="small" variant="secondary">
                            {t.invoices.open_pdf}
                          </Button>
                        </a>
                      ) : (
                        <Text size="small" className="text-ui-fg-subtle">
                          {t.invoices.no_file}
                        </Text>
                      )}
                    </div>
                  </div>

                  {correcting === invoice.id ? (
                    <div className="rounded-lg border p-3 flex flex-col gap-y-2">
                      <Text size="small" weight="plus">
                        {t.invoices.correction_title}
                      </Text>

                      {linesOf(invoice).map((line) => {
                        const open = line.quantity - (credited.get(line.position) ?? 0);

                        return (
                          <div
                            key={line.position}
                            className="flex items-center justify-between gap-x-4"
                          >
                            <Text size="small">
                              {line.position}. {line.title} · {line.quantity}{" "}
                              {t.invoices.billed} · {open} {t.invoices.open_qty}
                            </Text>
                            <Input
                              type="number"
                              min={0}
                              max={open}
                              className="w-24"
                              placeholder="0"
                              value={amounts[line.position] ?? ""}
                              onChange={(e) =>
                                setAmounts((prev) => ({
                                  ...prev,
                                  [line.position]: e.target.value,
                                }))
                              }
                              disabled={open <= 0}
                            />
                          </div>
                        );
                      })}

                      <div className="flex justify-end gap-x-2 mt-1">
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => setCorrecting(null)}
                        >
                          {t.invoices.abort}
                        </Button>
                        <Button
                          size="small"
                          onClick={() => submitCorrection(invoice)}
                          isLoading={saving}
                        >
                          {t.invoices.create_correction}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.after" });
export default OrderInvoiceWidget;
