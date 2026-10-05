import crypto from "crypto";
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";

/**
 * Zahlungsart "Auf Rechnung".
 *
 * Es gibt keinen Zahlungsdienst dahinter: Der Kunde bekommt eine Rechnung
 * und überweist. Deshalb sagt dieser Anbieter zu allem "in Ordnung" – so wie
 * die eingebaute Vorauszahlung (pp_system_default).
 *
 * Er braucht trotzdem eine eigene Kennung (pp_invoice_invoice), damit Shop
 * und Server "Auf Rechnung" von "Vorauszahlung" unterscheiden können.
 *
 * Ob ein Kunde auf Rechnung kaufen DARF, entscheidet nicht dieser Anbieter,
 * sondern die Prüfung beim Bestellabschluss (src/workflows/hooks/).
 */
class InvoicePaymentProviderService extends AbstractPaymentProvider {
  static identifier = "invoice";

  
  // Medusa erzeugt den Anbieter beim Start über diesen Konstruktor. Die
  // Vorlage AbstractPaymentProvider erlaubt das nur über einen eigenen,
  // öffentlichen Konstruktor – wir reichen alles unverändert weiter.
  constructor(cradle: Record<string, unknown>, config?: Record<string, unknown>) {
    super(cradle, config);
  }


  // Zahlung beginnt: Wir brauchen nur eine eindeutige Kennung.
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    return { id: crypto.randomUUID(), data: {} };
  }

  // Beim Bestellen: sofort freigegeben. Die Bestellung steht danach auf
  // "autorisiert", bis jemand im Admin den Geldeingang erfasst.
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return { data: input.data ?? {}, status: PaymentSessionStatus.AUTHORIZED };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { status: PaymentSessionStatus.AUTHORIZED };
  }

  // Im Admin "Zahlung erfassen" = das Geld ist auf dem Konto angekommen.
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data ?? {} };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    return { data: input.data ?? {} };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data ?? {} };
  }

  // Es gibt keinen Dienst, der uns Nachrichten schickt.
  async getWebhookActionAndData(
    data: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default InvoicePaymentProviderService;
