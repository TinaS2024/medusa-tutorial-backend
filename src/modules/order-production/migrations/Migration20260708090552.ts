import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260708090552 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "order_production" drop constraint if exists "order_production_order_id_unique";`);
    this.addSql(`create table if not exists "order_production" ("id" text not null, "order_id" text not null, "status" text check ("status" in ('received', 'paid', 'in_design', 'in_production', 'ready_to_ship', 'shipped', 'completed', 'cancelled')) not null default 'received', "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_production_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_production_order_id_unique" ON "order_production" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_production_deleted_at" ON "order_production" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "order_production_event" ("id" text not null, "status" text not null, "production_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_production_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_production_event_production_id" ON "order_production_event" ("production_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_production_event_deleted_at" ON "order_production_event" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "order_production_event" add constraint "order_production_event_production_id_foreign" foreign key ("production_id") references "order_production" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "order_production_event" drop constraint if exists "order_production_event_production_id_foreign";`);

    this.addSql(`drop table if exists "order_production" cascade;`);

    this.addSql(`drop table if exists "order_production_event" cascade;`);
  }

}
