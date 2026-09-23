import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Receipt } from "@medusajs/icons";
import {
  Button, Container, Heading, Input, Label, Select, Text, Textarea, toast,
} from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

type InvoiceSettings = {
  invoice_source: string;
  invoice_trigger_status: string;
  invoice_seller_country: string;
  invoice_tax_number: string;
  invoice_payment_terms_days: number;
  invoice_footer_note: string;
  invoice_number_prefix: string;
  invoice_number_pad_length: number;
  invoice_correction_prefix: string;
  invoice_correction_pad_length: number;
};

const DEFAULTS: InvoiceSettings = {
  invoice_source: "none",
  invoice_trigger_status: "ready_to_ship",
  invoice_seller_country: "de",
  invoice_tax_number: "",
  invoice_payment_terms_days: 14,
  invoice_footer_note: "",
  invoice_number_prefix: "RE-",
  invoice_number_pad_length: 6,
  invoice_correction_prefix: "GS-",
  invoice_correction_pad_length: 6,
};

/**
 * Nur die Schlüssel, nicht die Namen: Die Namen stehen schon in den
 * Sprachdateien unter email_templates.production_status_update.statuses
 * und werden dort auch von der Statusmeldung benutzt. So können die
 * beiden Listen nicht auseinanderlaufen.
 */
const STATUS_KEYS = [
  "received",
  "paid",
  "in_design",
  "in_production",
  "ready_to_ship",
  "shipped",
  "completed",
];

const SelectField = (props: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => (
  <div>
    <Label>{props.label}</Label>
    <Select value={props.value} onValueChange={props.onChange}>
      <Select.Trigger>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {props.options.map((o) => (
          <Select.Item key={o.value} value={o.value}>
            {o.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
    {props.hint ? (
      <Text size="small" className="text-ui-fg-subtle mt-1">
        {props.hint}
      </Text>
    ) : null}
  </div>
);

const InvoiceSettingsPage = () => {
  const [lang, setLang] = useState<Lang>(getClientLanguage);
  const t = getMessages(lang);

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const [form, setForm] = useState<InvoiceSettings>(DEFAULTS);

  const setField = (field: keyof InvoiceSettings, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const heute = new Date().toISOString().slice(0, 10);
  const [exportFrom, setExportFrom] = useState(`${heute.slice(0, 4)}-01-01`);
  const [exportTo, setExportTo] = useState(heute);

  // Die Auswahllisten stehen in der Komponente, weil sie t brauchen.
  const sourceOptions = [
    { value: "none", label: t.invoices.source_none },
    { value: "medusa", label: t.invoices.source_medusa },
    { value: "gpe", label: t.invoices.source_gpe },
  ];

  const statusLabels = t.email_templates.production_status_update
    .statuses as Record<string, string>;

  const statusOptions = STATUS_KEYS.map((value) => ({
    value,
    label: statusLabels[value] ?? value,
  }));

  const countryOptions = [
    { value: "de", label: t.invoices.country_de },
    { value: "fr", label: t.invoices.country_fr },
    { value: "nl", label: t.invoices.country_nl },
    { value: "gb", label: t.invoices.country_gb },
  ];

  const { data, isLoading, refetch } = useQuery<{ invoice_settings: InvoiceSettings }>({
    queryKey: ["invoice-settings"],
    queryFn: () => sdk.client.fetch("/admin/invoice-settings", { method: "GET" }),
  });

  useEffect(() => {
    const settings = data?.invoice_settings;
    if (!settings) return;
    setForm({
      ...settings,
      invoice_tax_number: settings.invoice_tax_number ?? "",
      invoice_footer_note: settings.invoice_footer_note ?? "",
    });
  }, [data]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async () =>
      sdk.client.fetch("/admin/invoice-settings", { method: "POST", body: form }),
  });

  const onSave = async () => {
    try {
      await mutateAsync();
      toast.success(t.invoices.save_info);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || t.invoices.save_error);
    }
  };

  const sampleNumber = (prefix: string, length: number) =>
    `${prefix}${"1".padStart(length, "0")}`;

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.invoices.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2">{t.invoices.intro}</Text>

        <div className="mt-6 grid gap-y-4">
          <SelectField
            label={t.invoices.source}
            value={form.invoice_source}
            options={sourceOptions}
            onChange={(v) => setField("invoice_source", v)}
            hint={t.invoices.source_hint}
          />

          <SelectField
            label={t.invoices.trigger}
            value={form.invoice_trigger_status}
            options={statusOptions}
            onChange={(v) => setField("invoice_trigger_status", v)}
            hint={t.invoices.trigger_hint}
          />

          <SelectField
            label={t.invoices.seller_country}
            value={form.invoice_seller_country}
            options={countryOptions}
            onChange={(v) => setField("invoice_seller_country", v)}
            hint={t.invoices.seller_country_hint}
          />

          <div>
            <Label>{t.invoices.tax_number}</Label>
            <Input
              value={form.invoice_tax_number}
              onChange={(e) => setField("invoice_tax_number", e.target.value)}
              placeholder="12/345/67890"
              disabled={isLoading}
            />
            <Text size="small" className="text-ui-fg-subtle mt-1">
              {t.invoices.tax_number_hint}
            </Text>
          </div>

          <div>
            <Label>{t.invoices.payment_terms}</Label>
            <Input
              type="number"
              value={String(form.invoice_payment_terms_days)}
              onChange={(e) => setField("invoice_payment_terms_days", Number(e.target.value))}
              disabled={isLoading}
            />
          </div>

          <div>
            <Label>{t.invoices.footer_note}</Label>
            <Textarea
              value={form.invoice_footer_note}
              onChange={(e) => setField("invoice_footer_note", e.target.value)}
              placeholder={t.invoices.footer_note_placeholder}
              disabled={isLoading}
            />
          </div>

          <Heading level="h2" className="mt-4">{t.invoices.series}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t.invoices.series_hint}
          </Text>

          <div className="grid grid-cols-2 gap-x-4">
            <div>
              <Label>{t.invoices.prefix_invoice}</Label>
              <Input
                value={form.invoice_number_prefix}
                onChange={(e) => setField("invoice_number_prefix", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <Label>{t.invoices.digits}</Label>
              <Input
                type="number"
                value={String(form.invoice_number_pad_length)}
                onChange={(e) => setField("invoice_number_pad_length", Number(e.target.value))}
                disabled={isLoading}
              />
            </div>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {t.invoices.first_invoice}{" "}
            {sampleNumber(form.invoice_number_prefix, form.invoice_number_pad_length)}
          </Text>

          <div className="grid grid-cols-2 gap-x-4">
            <div>
              <Label>{t.invoices.prefix_correction}</Label>
              <Input
                value={form.invoice_correction_prefix}
                onChange={(e) => setField("invoice_correction_prefix", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <Label>{t.invoices.digits}</Label>
              <Input
                type="number"
                value={String(form.invoice_correction_pad_length)}
                onChange={(e) =>
                  setField("invoice_correction_pad_length", Number(e.target.value))
                }
                disabled={isLoading}
              />
            </div>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {t.invoices.first_correction}{" "}
            {sampleNumber(form.invoice_correction_prefix, form.invoice_correction_pad_length)}
          </Text>

          <div className="flex justify-end gap-x-2 mt-4">
            <Button variant="secondary" disabled={isPending} onClick={() => refetch()}>
              {t.invoices.reload}
            </Button>
            <Button variant="primary" isLoading={isPending} onClick={onSave}>
              {t.invoices.save}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Heading level="h2">{t.invoices.export}</Heading>
        <Text className="text-ui-fg-subtle mt-2">{t.invoices.export_intro}</Text>

        <div className="mt-4 flex items-end gap-x-4">
          <div>
            <Label>{t.invoices.export_from}</Label>
            <Input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>{t.invoices.export_to}</Label>
            <Input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
            />
          </div>

          <a
            href={`/admin/invoice-export?from=${exportFrom}&to=${exportTo}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="secondary">{t.invoices.export_download}</Button>
          </a>
        </div>

        <Text size="small" className="text-ui-fg-subtle mt-2">
          {t.invoices.export_hint}
        </Text>
      </div>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).invoices.menu,
  icon: Receipt,
});

export default InvoiceSettingsPage;
