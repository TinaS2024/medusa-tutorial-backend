import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261007090746 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "gift_card_redemption" add column if not exists "cart_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_card_redemption_cart_id" ON "gift_card_redemption" ("cart_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_gift_card_redemption_cart_id";`);
    this.addSql(`alter table if exists "gift_card_redemption" drop column if exists "cart_id";`);
  }

}
