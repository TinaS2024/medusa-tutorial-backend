import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260917100423 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "invoice" add column if not exists "mailed_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "invoice" drop column if exists "mailed_at";`);
  }

}
