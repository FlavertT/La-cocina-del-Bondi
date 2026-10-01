CREATE TABLE `billed_orders` (
	`order_id` integer PRIMARY KEY NOT NULL,
	`invoice_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_billed_orders_invoice` ON `billed_orders` (`invoice_key`);