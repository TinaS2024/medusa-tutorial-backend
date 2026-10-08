import { useEffect, useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui";
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "../lib/sdk";
import { getClientLanguage } from "../lib/i18n";
import { getMessages, type Lang } from "../lib/messages";

type PurchasedCard = {
  id: string
  code: string
  initial_amount: number
  balance: number
  currency_code: string
  expires_at: string | null
  is_disabled: boolean
}

type Redemption = {
  id: string
  gift_card_id: string
  code: string | null
  amount: number
}

type OrderGiftCardsResponse = {
  purchased: PurchasedCard[]
  redeemed: Redemption[]
}

const OrderGiftCardsWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => 
{
  const [lang, setLang] = useState<Lang>(getClientLanguage);
  const t = getMessages(lang).gift_cards;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const { data } = useQuery<OrderGiftCardsResponse>({
    queryKey: ["order-gift-cards", order.id],
    queryFn: () => sdk.client.fetch(`/admin/gift-cards/order/${order.id}`),
  });

  // Bestellungen ohne Geschenkkarten: Widget gar nicht anzeigen.
  if (!data || (data.purchased.length === 0 && data.redeemed.length === 0)) 
  {
    return null;
  }

  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(lang, { style: "currency", currency: currency.toUpperCase() }).format(amount);

  // Ablaufdatum ist in Weltzeit gespeichert – ohne timeZone erschiene der 1.1.
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang, { timeZone: "UTC" }) : t.unlimited;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t.copied);
    } catch {
      toast.error(t.copy_failed);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t.heading}</Heading>
      </div>

      {data.purchased.length > 0 && (
        <div className="px-6 py-4 flex flex-col gap-y-3">
          <Text size="small" weight="plus">{t.purchased}</Text>
          <Text size="small" className="text-ui-fg-subtle">{t.purchased_hint}</Text>

          {data.purchased.map((card) => (
            <div key={card.id} className="flex items-center justify-between gap-x-3">
              <div className="flex flex-col">
                <Text className="font-mono text-lg">{card.code}</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {money(card.initial_amount, card.currency_code)} · {t.balance}:{" "}
                  {money(card.balance, card.currency_code)} · {t.valid_until}: {day(card.expires_at)}
                </Text>
              </div>
              <div className="flex items-center gap-x-2">
                {card.is_disabled && <Badge color="red">{t.disabled}</Badge>}
                <Button size="small" variant="secondary" onClick={() => copy(card.code)}>
                  {t.copy}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.redeemed.length > 0 && (
        <div className="px-6 py-4 flex flex-col gap-y-2">
          <Text size="small" weight="plus">{t.redeemed}</Text>

          {data.redeemed.map((r) => (
            <div key={r.id} className="flex items-center justify-between">
              <Text size="small" className="font-mono">{r.code ?? "—"}</Text>
              <Text size="small">
                {/* Negativer Betrag = Rückbuchung beim Storno */}
                {r.amount < 0
                  ? `${t.refunded} ${money(-r.amount, order.currency_code)}`
                  : money(-r.amount, order.currency_code)}
              </Text>

            </div>
          ))}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderGiftCardsWidget;
