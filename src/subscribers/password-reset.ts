import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";

type PasswordResetEvent = {
  entity_id: string
  token: string
  actor_type: string
}

export default async function passwordResetSubscriber({event: { data },container}: SubscriberArgs<PasswordResetEvent>) {
  const notificationModuleService = container.resolve(Modules.NOTIFICATION);

  const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:8000";
  const email = data.entity_id;
  const token = data.token;

  const resetUrl = `${storefrontUrl}/account/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  await notificationModuleService.createNotifications({
    to: email,
    channel: "email",
    template: "password-reset",
    data: {
      reset_url: resetUrl,
      token,
    },
  })
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}