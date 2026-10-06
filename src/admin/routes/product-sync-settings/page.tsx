import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

type LastRun = {
  started_at: string
  finished_at: string
  trigger: "schedule" | "manual"
  ok: boolean
  matched: number
  identity_updates: number
  price_updates: number
  not_found: number
  message: string | null
  duration_ms: number
}

type ProductSyncResponse = {
  product_sync: {
    enabled: boolean
    interval_minutes: number
    sync_prices: boolean
    running: boolean
    last_run: LastRun | null
    next_run_at: string | null
  }
}

const ProductSyncSettingsPage = () => {
  const [lang, setLang] = useState<Lang>(getClientLanguage);
  const t = getMessages(lang).product_sync;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState("");
  const [syncPrices, setSyncPrices] = useState(true);

  const { data, isLoading, refetch } = useQuery<ProductSyncResponse>({
    queryKey: ["product-sync-settings"],
    queryFn: () => sdk.client.fetch("/admin/product-sync-settings", { method: "GET" }),
  });

  // Geladene Werte in die Eingabefelder übernehmen.
  useEffect(() => {
    const s = data?.product_sync;
    if (!s) return;
    setEnabled(s.enabled);
    setIntervalMinutes(String(s.interval_minutes));
    setSyncPrices(s.sync_prices);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/product-sync-settings", {
        method: "POST",
        body: {
          enabled,
          interval_minutes: Number(intervalMinutes),
          sync_prices: syncPrices,
        },
      }),
  });

  // Derselbe Knopf wie bisher: POST /admin/erp/products/sync.
  const runNow = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/erp/products/sync", {
        method: "POST",
        body: { sync_prices: syncPrices },
      }),
  });

  const onSave = async () => {
    try {
      await save.mutateAsync();
      toast.success(t.save_ok);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || t.save_error);
    }
  };

  const onRunNow = async () => {
    try {
      await runNow.mutateAsync();
      toast.success(t.run_ok);
    } catch (e: any) {
      toast.error(e?.message || t.run_error);
    } finally {
      await refetch();
    }
  };

  const s = data?.product_sync;
  const last = s?.last_run ?? null;
  const formatDate = (iso: string) => new Date(iso).toLocaleString(lang);

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2">{t.intro}</Text>

        <div className="mt-6 grid gap-y-4">
          <div className="flex items-center gap-x-3">
            <Switch
              id="product-sync-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={isLoading}
            />
            <Label htmlFor="product-sync-enabled">{t.enabled}</Label>
          </div>

          <div>
            <Label htmlFor="product-sync-interval">{t.interval}</Label>
            <Input
              id="product-sync-interval"
              type="number"
              min={5}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(e.target.value)}
              disabled={isLoading || !enabled}
            />
            <Text size="small" className="text-ui-fg-subtle mt-1">
              {t.interval_hint}
            </Text>
          </div>

          <div className="flex items-center gap-x-3">
            <Switch
              id="product-sync-prices"
              checked={syncPrices}
              onCheckedChange={setSyncPrices}
              disabled={isLoading}
            />
            <Label htmlFor="product-sync-prices">{t.sync_prices}</Label>
          </div>

          <div className="flex justify-end gap-x-2">
            <Button variant="secondary" disabled={save.isPending} onClick={() => refetch()}>
              {t.reload}
            </Button>
            <Button variant="primary" isLoading={save.isPending} onClick={onSave}>
              {t.save}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">{t.last_run}</Heading>
          {s?.running ? (
            <Badge color="blue">{t.running}</Badge>
          ) : last ? (
            <Badge color={last.ok ? "green" : "red"}>{last.ok ? t.ok : t.failed}</Badge>
          ) : null}
        </div>

        {last ? (
          <div className="mt-3 grid gap-y-1">
            <Text size="small">
              {t.started_at}: {formatDate(last.started_at)} (
              {last.trigger === "manual" ? t.trigger_manual : t.trigger_schedule})
            </Text>
            <Text size="small">{t.duration}: {Math.round(last.duration_ms / 1000)} s</Text>
            <Text size="small">{t.matched}: {last.matched}</Text>
            <Text size="small">{t.identity_updates}: {last.identity_updates}</Text>
            <Text size="small">{t.price_updates}: {last.price_updates}</Text>
            <Text size="small">{t.not_found}: {last.not_found}</Text>
            {last.message && (
              <Text size="small" className="text-ui-fg-subtle">
                {t.message}: {last.message}
              </Text>
            )}
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle mt-3">{t.never}</Text>
        )}

        <Text size="small" className="mt-3">
          {t.next_run}:{" "}
          {!s?.enabled ? t.disabled : s.next_run_at ? formatDate(s.next_run_at) : t.next_tick}
        </Text>

        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            isLoading={runNow.isPending}
            disabled={s?.running}
            onClick={onRunNow}
          >
            {t.run_now}
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).product_sync.menu,
  icon: CubeSolid,
})

export default ProductSyncSettingsPage;
