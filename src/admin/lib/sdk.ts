import Medusa from "@medusajs/js-sdk";

// baseUrl an die Herkunft der Admin-Seite binden statt fest "localhost:9000":
// So zeigt der Client immer auf das Backend, das das Admin ausliefert – egal ob
// lokal, per Server-IP oder Domain. Damit sind die Aufrufe Same-Origin (kein CORS).
const baseUrl =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:9000"

export const sdk = new Medusa({
    baseUrl,
    debug: process.env.NODE_ENV === "development",
    auth: {
        type: "session",
        },
})
