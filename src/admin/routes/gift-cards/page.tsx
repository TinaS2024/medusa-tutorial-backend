import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Gift } from "@medusajs/icons";
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  Label,
  Table,
  Text,
  toast,
} from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

type GiftCard = {
  id: string
  code: string
  initial_amount: number
  balance: number
  currency_code: string
  expires_at: string | null
  is_disabled: boolean
  order_id: string | null
  created_at: string
}

type ListResponse = { gift_cards: GiftCard[]; count: number; offset: number; limit: number }

const GiftCardsPage = () => {
  const [lang, setLang] = useState<Lang>(getClientLanguage);
  const t = getMessages(lang).gift_cards;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  // ---------- Einstellung: Gültigkeit ----------
  const [validYears, setValidYears] = useState("");

  const settings = useQuery<{ valid_years: number }>({
    queryKey: ["gift-card-settings"],
    queryFn: () => sdk.client.fetch("/admin/gift-card-settings"),
  });

  useEffect(() => {
    if (settings.data) setValidYears(String(settings.data.valid_years));
  }, [settings.data]);

  const saveSettings = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/gift-card-settings", {
        method: "POST",
        body: { valid_years: Number(validYears) },
      }),
    onSuccess: () => toast.success(t.saved),
    onError: (e: any) => toast.error(e?.message || t.save_failed),
  });

  // ---------- Karte von Hand anlegen ----------
  const [amount, setAmount] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);

  // ---------- Liste ----------
  const [search, setSearch] = useState("");
  const [onlyBalance, setOnlyBalance] = useState(true);
  const [offset, setOffset] = useState(0);

  // Bei neuer Suche oder anderem Filter wieder auf Seite 1.
  useEffect(() => {
    setOffset(0);
  }, [search, onlyBalance]);

  const list = useQuery<ListResponse>({
    queryKey: ["gift-cards", search, onlyBalance, offset],
    queryFn: () =>
      sdk.client.fetch("/admin/gift-cards", {
        query: { q: search, only_balance: String(onlyBalance), offset },
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ gift_card: GiftCard }>("/admin/gift-cards", {
        method: "POST",
        body: { amount: Number(amount.replace(",", ".")) },
      }),
    onSuccess: (data) => {
      setNewCode(data.gift_card.code);
      setAmount("");
      toast.success(t.created);
      list.refetch();
    },
    onError: (e: any) => toast.error(e?.message || t.create_failed),
  });

  const toggle = useMutation({
    mutationFn: (card: GiftCard) =>
      sdk.client.fetch(`/admin/gift-cards/${card.id}`, {
        method: "POST",
        body: { is_disabled: !card.is_disabled },
      }),
    onSuccess: () => {
      toast.success(t.updated);
      list.refetch();
    },
    onError: (e: any) => toast.error(e?.message || t.save_failed),
  });

  const onToggle = (card: GiftCard) => {
    if (!card.is_disabled && !window.confirm(t.disable_confirm)) return;
    toggle.mutate(card);
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t.copied);
    } catch {
      toast.error(t.copy_failed);
    }
  };

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(lang, { style: "currency", currency: currency.toUpperCase() }).format(value);

  // Ablaufdatum ist in Weltzeit gespeichert – ohne timeZone erschiene der 1.1.
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang, { timeZone: "UTC" }) : t.unlimited;

  const statusBadge = (card: GiftCard) => {
    if (card.is_disabled) return <Badge color="red">{t.disabled}</Badge>;
    if (card.expires_at && new Date(card.expires_at).getTime() < Date.now())
      return <Badge color="orange">{t.status_expired}</Badge>;
    if (card.balance <= 0) return <Badge color="grey">{t.status_empty}</Badge>;
    return <Badge color="green">{t.status_active}</Badge>;
  };

  const count = list.data?.count ?? 0;
  const limit = list.data?.limit ?? 50;

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-6">
        <Heading level="h1">{t.menu}</Heading>
        <Text className="text-ui-fg-subtle mt-2">{t.intro}</Text>
      </Container>

      <div className="grid gap-3 md:grid-cols-2">
        <Container className="p-6 flex flex-col gap-y-3">
          <Heading level="h2">{t.settings_heading}</Heading>
          <div>
            <Label htmlFor="gift-card-valid-years">{t.valid_years}</Label>
            <Input
              id="gift-card-valid-years"
              type="number"
              min={1}
              max={30}
              value={validYears}
              onChange={(e) => setValidYears(e.target.value)}
              disabled={settings.isLoading}
            />
            <Text size="small" className="text-ui-fg-subtle mt-1">{t.valid_years_hint}</Text>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="small" isLoading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
              {t.save}
            </Button>
          </div>
        </Container>

        <Container className="p-6 flex flex-col gap-y-3">
          <Heading level="h2">{t.create_heading}</Heading>
          <Text size="small" className="text-ui-fg-subtle">{t.create_hint}</Text>
          <div className="flex items-end gap-x-3">
            <div className="flex-1">
              <Label htmlFor="gift-card-amount">{t.amount}</Label>
              <Input
                id="gift-card-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25"
              />
            </div>
            <Button
              variant="primary"
              size="small"
              isLoading={create.isPending}
              disabled={!amount.trim()}
              onClick={() => create.mutate()}
            >
              {t.create}
            </Button>
          </div>
          {newCode && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Text size="small" className="text-ui-fg-subtle">{t.new_code}</Text>
                <Text className="font-mono text-lg">{newCode}</Text>
              </div>
              <Button size="small" variant="secondary" onClick={() => copy(newCode)}>
                {t.copy}
              </Button>
            </div>
          )}
        </Container>
      </div>

      <Container className="p-0 divide-y">
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <Heading level="h2">{t.list_heading}</Heading>
          <div className="flex items-center gap-x-4">
            <Input
              placeholder={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[220px]"
            />
            <div className="flex items-center gap-x-2">
              <Checkbox
                id="gift-card-only-balance"
                checked={onlyBalance}
                onCheckedChange={(checked) => setOnlyBalance(checked === true)}
              />
              <Label htmlFor="gift-card-only-balance">{t.only_balance}</Label>
            </div>
          </div>
        </div>

        {list.data && list.data.gift_cards.length === 0 ? (
          <Text className="px-6 py-4 text-ui-fg-subtle">{t.none}</Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t.col_code}</Table.HeaderCell>
                <Table.HeaderCell>{t.col_value}</Table.HeaderCell>
                <Table.HeaderCell>{t.col_balance}</Table.HeaderCell>
                <Table.HeaderCell>{t.col_valid_until}</Table.HeaderCell>
                <Table.HeaderCell>{t.col_status}</Table.HeaderCell>
                <Table.HeaderCell>{t.col_order}</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(list.data?.gift_cards ?? []).map((card) => (
                <Table.Row key={card.id}>
                  <Table.Cell>
                    <span className="font-mono">{card.code}</span>
                  </Table.Cell>
                  <Table.Cell>{money(card.initial_amount, card.currency_code)}</Table.Cell>
                  <Table.Cell>{money(card.balance, card.currency_code)}</Table.Cell>
                  <Table.Cell>{day(card.expires_at)}</Table.Cell>
                  <Table.Cell>{statusBadge(card)}</Table.Cell>
                  <Table.Cell>
                    {card.order_id ? (
                      <a className="text-ui-fg-interactive" href={`/app/orders/${card.order_id}`}>
                        {card.order_id.slice(-6)}
                      </a>
                    ) : (
                      <span className="text-ui-fg-subtle">{t.manual}</span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={toggle.isPending}
                      onClick={() => onToggle(card)}
                    >
                      {card.is_disabled ? t.enable : t.disable}
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}

        {count > limit && (
          <div className="px-6 py-4 flex items-center justify-between">
            <Text size="small" className="text-ui-fg-subtle">
              {offset + 1}–{Math.min(offset + limit, count)} / {count}
            </Text>
            <div className="flex gap-x-2">
              <Button
                size="small"
                variant="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                {t.previous}
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={offset + limit >= count}
                onClick={() => setOffset(offset + limit)}
              >
                {t.next}
              </Button>
            </div>
          </div>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).gift_cards.menu,
  icon: Gift,
})

export default GiftCardsPage;
