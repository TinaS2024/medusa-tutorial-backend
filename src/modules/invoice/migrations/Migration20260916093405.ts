import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260916093405 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "invoice" drop constraint if exists "invoice_number_unique";`);
    this.addSql(`create table if not exists "invoice" ("id" text not null, "number" text not null, "type" text check ("type" in ('invoice', 'cancellation', 'credit_note')) not null default 'invoice', "order_id" text not null, "corrects_invoice_id" text null, "issued_at" timestamptz not null, "service_date" timestamptz null, "currency_code" text not null, "total_net" numeric not null, "total_tax" numeric not null, "total_gross" numeric not null, "locale" text not null default 'de', "buyer_vat_id" text null, "tax_note" text null, "pdf_filename" text null, "snapshot" jsonb not null, "raw_total_net" jsonb not null, "raw_total_tax" jsonb not null, "raw_total_gross" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "invoice_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoice_number_unique" ON "invoice" ("number") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_order_id" ON "invoice" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_deleted_at" ON "invoice" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "invoice_number_series" ("id" text not null, "prefix" text not null default '', "pad_length" integer not null default 6, "last_number" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "invoice_number_series_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_number_series_deleted_at" ON "invoice_number_series" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "invoice" cascade;`);

    this.addSql(`drop table if exists "invoice_number_series" cascade;`);
  }

}
