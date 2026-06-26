import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CreditCard } from "@medusajs/icons";
import { Button, Container, Heading, Input, Label, Text, Textarea, toast } from "@medusajs/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

type BankSettings = {
  bank_account_holder: string | null
  bank_name: string | null
  bank_iban: string | null
  bank_bic: string | null
  bank_note: string | null
}

const BankSettingsPage = () => {

    const [lang, setLang] = useState<Lang>("de");
    const t = getMessages(lang);
    
    useEffect(() => {
        setLang(getClientLanguage())
        }, []);


  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [note, setNote] = useState("");

  const { data, isLoading, refetch } = useQuery<{ bank_settings: BankSettings }>({
    queryKey: ["bank-settings"],
    queryFn: () => sdk.client.fetch("/admin/bank-settings", { method: "GET" }),
  })

  useEffect(() => {
    const s = data?.bank_settings;
    if (!s) return;
    setAccountHolder(s.bank_account_holder ?? "");
    setBankName(s.bank_name ?? "");
    setIban(s.bank_iban ?? "");
    setBic(s.bank_bic ?? "");
    setNote(s.bank_note ?? "");
  }, [data])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async () =>
      sdk.client.fetch("/admin/bank-settings", {
        method: "POST",
        body: {
          bank_account_holder: accountHolder,
          bank_name: bankName,
          bank_iban: iban,
          bank_bic: bic,
          bank_note: note,
        },
      }),
  })

  const onSave = async () => {
    try {
      await mutateAsync();
      toast.success(t.bank_settings.save_info);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || t.bank_settings.save_error);
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <Heading level="h1">{t.bank_settings.bank_connect}</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          {t.bank_settings.bank_info}
        </Text>

        <div className="mt-6 grid gap-y-4">
          <div>
            <Label>{t.bank_settings.account_holder}</Label>
            <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Mustermann GmbH" disabled={isLoading} />
          </div>
          <div>
            <Label>{t.bank_settings.bank_name}</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Musterbank" disabled={isLoading} />
          </div>
          <div>
            <Label>{t.bank_settings.iban}</Label>
            <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE00 0000 0000 0000 0000 00" disabled={isLoading} />
          </div>
          <div>
            <Label>{t.bank_settings.bic}</Label>
            <Input value={bic} onChange={(e) => setBic(e.target.value)} placeholder="XXXXDEXXXXX" disabled={isLoading} />
          </div>
          <div>
            <Label>{t.bank_settings.note}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bitte innerhalb von 14 Tagen unter Angabe der Bestellnummer überweisen." disabled={isLoading} />
          </div>

          <div className="flex justify-end gap-x-2">
            <Button variant="secondary" disabled={isPending} onClick={() => refetch()}>{t.bank_settings.load}</Button>
            <Button variant="primary" isLoading={isPending} onClick={onSave}>{t.bank_settings.save}</Button>
          </div>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).bank_settings.bank,
  icon: CreditCard,
})

export default BankSettingsPage;
