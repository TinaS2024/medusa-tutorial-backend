import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

type EmailSettingsResponse = {
  email_settings: {
    email_from: string | null
    email_from_name: string | null
    storefront_url: string | null
    email_locale: "de" | "en" | "fr" | "nl" | null
    smtp_host: string | null
    smtp_port: number | null
    smtp_user: string | null
    smtp_pass: string | null
  }
}

const normalize = (v: unknown) => {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length ? s : null;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse<EmailSettingsResponse>
) {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  const md = (store?.metadata as Record<string, unknown> | null) ?? null;

  const rawLocale = typeof md?.email_locale === "string" ? md.email_locale : null;
  const email_locale = rawLocale === "de" || rawLocale === "en" || rawLocale === "fr" || rawLocale === "nl"
      ? rawLocale
      : null;

   res.json({
    email_settings: {
      email_from: typeof md?.email_from === "string" ? md.email_from : null,
      email_from_name:
        typeof md?.email_from_name === "string" ? md.email_from_name : null,
      storefront_url:
        typeof md?.storefront_url === "string" ? md.storefront_url : null,
      email_locale,
      smtp_host: typeof md?.smtp_host === "string" ? md.smtp_host : null,
      smtp_port: typeof md?.smtp_port === "number" ? md.smtp_port : null,
      smtp_user: typeof md?.smtp_user === "string" ? md.smtp_user : null,
      smtp_pass: typeof md?.smtp_pass === "string" ? md.smtp_pass : null,
    },
  })
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse<EmailSettingsResponse | { message: string }>
) {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });

  if (!store) {
    res.status(400).json({ message: "No store found" })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const email_from = normalize(body.email_from);
  const email_from_name = normalize(body.email_from_name);
  const storefront_url = normalize(body.storefront_url);
  const email_locale_raw = normalize(body.email_locale);

  const smtp_host = normalize(body.smtp_host);
  const smtp_user = normalize(body.smtp_user);
  const smtp_pass = normalize(body.smtp_pass);
  const smtp_port_raw = normalize(body.smtp_port);
  const smtp_port = smtp_port_raw ? Number(smtp_port_raw) : null;


  const email_locale =
    email_locale_raw === "de" ||
    email_locale_raw === "en" ||
    email_locale_raw === "fr" ||
    email_locale_raw === "nl"
      ? email_locale_raw
      : null;

  if (email_locale_raw && !email_locale) 
{
    res.status(400).json({ message: "Invalid email locale" });
    return;
  }

  if (email_from && !isEmail(email_from)) 
{
    res.status(400).json({ message: "Invalid from email address" });
    return;
  }

  const prev = (store.metadata as Record<string, unknown> | null) ?? {};
    const metadata = {
    ...prev,
    email_from,
    email_from_name,
    storefront_url,
    email_locale,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_pass,
  }


  await storeModuleService.updateStores({ id: store.id }, { metadata });

    res.json({
    email_settings: {
      email_from,
      email_from_name,
      storefront_url,
      email_locale,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
    },
  })
}
