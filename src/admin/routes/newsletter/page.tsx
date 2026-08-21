import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CubeSolid } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Table, Text, Input, Label, toast, Switch } from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sdk } from "../../lib/sdk";
import { getClientLanguage } from "../../lib/i18n";
import { getMessages, type Lang } from "../../lib/messages";

type Eintrag = {
  id: string
  email: string
  status: "pending" | "confirmed" | "unsubscribed"
  locale: string
  created_at: string
  confirmed_at: string | null
}

const NewsletterPage = () => {

  const [betreff, setBetreff] = useState("");
  const [nachricht, setNachricht] = useState("");
  const [testAdresse, setTestAdresse] = useState("");
  const [sendet, setSendet] = useState(false);
  const [zeigeAbgemeldete, setZeigeAbgemeldete] = useState(false);


  const senden = async (nurTest: boolean) => {
    if (!nurTest) {
      const anzahl = z?.confirmed ?? 0
      if (!window.confirm(t.confirm_send.replace("{anzahl}", String(anzahl)))) return
    }

    setSendet(true)
    try {
      const antwort: any = await sdk.client.fetch("/admin/newsletter/send", {
        method: "POST",
        body: {
          subject: betreff,
          text: nachricht,
          testTo: nurTest ? testAdresse : undefined,
        },
      })

      toast.success(
        nurTest
          ? t.test_sent
          : t.sent
              .replace("{gesendet}", String(antwort.gesendet))
              .replace("{fehler}", String(antwort.fehlgeschlagen))
      )
    } catch (e: any) {
      toast.error(e?.message || t.send_error)
    } finally {
      setSendet(false)
    }
  }

  const [lang, setLang] = useState<Lang>("de");
  const t = getMessages(lang).newsletter;

  useEffect(() => {
    setLang(getClientLanguage());
  }, []);

  const { data, isLoading, refetch } = useQuery<{
    subscribers: Eintrag[]
    zaehler: Record<string, number>
  }>({
    queryKey: ["newsletter"],
    queryFn: () => sdk.client.fetch("/admin/newsletter", { method: "GET" }),
  })

  const eintraege = data?.subscribers ?? [];

  // Abgemeldete bleiben gespeichert, stören in der Übersicht aber nur.
  const sichtbar = zeigeAbgemeldete ? eintraege : eintraege.filter((e) => e.status !== "unsubscribed")

  const z = data?.zaehler;

  return (
    <Container className="divide-y p-0">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <Heading level="h1">{t.title}</Heading>
          </div>
        </div>

          <div className="mt-6 rounded-lg border border-ui-border-base p-4 grid gap-y-4 max-w-2xl">
          <Heading level="h2" className="text-base">{t.compose}</Heading>

          <div>
            <Label>{t.subject}</Label>
            <Input value={betreff} onChange={(e) => setBetreff(e.target.value)} disabled={sendet} />
          </div>

          <div>
            <Label>{t.message}</Label>
            <Text size="small" className="text-ui-fg-subtle mb-1">{t.message_hint}</Text>
            <textarea
              rows={12}
              value={nachricht}
              onChange={(e) => setNachricht(e.target.value)}
              disabled={sendet}
              className="w-full rounded-md border border-ui-border-base bg-ui-bg-field p-3 text-sm"
            />
          </div>

          <div>
            <Label>{t.test_to}</Label>
            <Text size="small" className="text-ui-fg-subtle mb-1">{t.test_to_hint}</Text>
            <div className="flex gap-x-2">
              <Input
                value={testAdresse}
                onChange={(e) => setTestAdresse(e.target.value)}
                placeholder="ich@firma.de"
                disabled={sendet}
              />
              <Button
                variant="secondary"
                onClick={() => senden(true)}
                disabled={sendet || !testAdresse || !betreff || !nachricht}
              >
                {t.send_test}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              isLoading={sendet}
              onClick={() => senden(false)}
              disabled={!betreff || !nachricht || !(z?.confirmed)}
            >
              {t.send_all}
            </Button>
          </div>
        </div>

        <div className="mt-6">
           {z && (
          <div className="flex gap-x-6 mt-4">
            <Text><strong>{z.confirmed}</strong> {t.confirmed}</Text>
            <Text className="text-ui-fg-subtle">{z.pending} {t.pending}</Text>
            <Text className="text-ui-fg-subtle">{z.unsubscribed} {t.unsubscribed}</Text>
          
            <div className="flex items-center gap-x-3">
                <div className="flex items-center gap-x-2">
                  <Switch
                    checked={zeigeAbgemeldete}
                    onCheckedChange={setZeigeAbgemeldete}
                  />
                  <Text size="small" className="text-ui-fg-subtle">{t.show_unsubscribed}</Text>
                </div>

                <Button variant="secondary" onClick={() => refetch()} disabled={isLoading}>
                  {t.reload}
                </Button>
              </div>
          </div>
        )}
          <Text className="text-ui-fg-subtle mt-2">{t.intro}</Text>
          {sichtbar.length === 0 ? (
            <Text className="text-ui-fg-subtle">{t.empty}</Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t.email}</Table.HeaderCell>
                  <Table.HeaderCell>{t.status}</Table.HeaderCell>
                  <Table.HeaderCell>{t.language}</Table.HeaderCell>
                  <Table.HeaderCell>{t.registered}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {sichtbar.map((e) => (
                  <Table.Row key={e.id}>
                    <Table.Cell>{e.email}</Table.Cell>
                    <Table.Cell>
                      <Badge color={
                        e.status === "confirmed" ? "green"
                        : e.status === "pending" ? "orange"
                        : "grey"
                      }>
                        {(t as any)[e.status]}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{e.locale?.toUpperCase()}</Table.Cell>
                    <Table.Cell>
                      {new Date(e.created_at).toLocaleDateString()}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: getMessages(getClientLanguage()).newsletter.menu,
  icon: CubeSolid,
})

export default NewsletterPage;
