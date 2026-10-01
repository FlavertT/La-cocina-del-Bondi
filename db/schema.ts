// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', {
 id: integer('id').primaryKey({autoIncrement:true}), kind:text('kind').notNull(), data:text('data').notNull(),
 version:integer('version').notNull().default(1), creator:text('creator').notNull(), created:text('created').notNull(),
}, t=>[index('idx_records_kind').on(t.kind)]);
export const members=sqliteTable('members', {email:text('email').primaryKey(), name:text('name').notNull(), role:text('role').notNull(), owner:integer('owner').notNull().default(0)});
export const billedOrders=sqliteTable('billed_orders', {orderId:integer('order_id').primaryKey(),invoiceKey:text('invoice_key').notNull()},t=>[index('idx_billed_orders_invoice').on(t.invoiceKey)]);
export const preparations=sqliteTable('preparations',{orderId:integer('order_id').primaryKey(),data:text('data').notNull()});
export const productions=sqliteTable('productions',{key:text('key').primaryKey(),data:text('data').notNull(),created:text('created').notNull()});
export const stockAlerts=sqliteTable('stock_alerts',{id:integer('id').primaryKey({autoIncrement:true}),operation:text('operation').notNull(),productId:integer('product_id').notNull(),data:text('data').notNull(),status:text('status').notNull(),created:text('created').notNull(),providerId:text('provider_id'),error:text('error')});
