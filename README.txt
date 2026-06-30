So können Sie Stripe für Zahlungsdienste (Kreditkarte, Debitkarte, PayPal, Klarna ect.) aktivieren:

1. Paket installieren: npm install  @medusajs/payment-stripe
2. Keys in .env eintragen (in .env.example ist ein Beispiel dafür vorhanden)
3. Backend neustarten -> der Provider pp_stripe_stripe ist verfügbar
4. Im Admin Region -> Zahlungsanbieter -> Stripe aktivieren
5. Webhook in Stripe einrichten -> https://<backend>/hooks/payment/stripe


Im Terminal eingeben um Stripe-Zugang zu prüfen:
C:\stripe
stripe login
.\stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe


Zum Testen für Sepa: DE89 3704 0044 0532 0130 00
Zum Testen für Kreditkarte: 4242 4242 4242 4242

TODO:
- SEPA-Synchronität noch ermöglichen
