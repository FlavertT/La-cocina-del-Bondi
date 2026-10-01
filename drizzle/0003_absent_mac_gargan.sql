CREATE TABLE `productions` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation` text NOT NULL,
	`product_id` integer NOT NULL,
	`data` text NOT NULL,
	`status` text NOT NULL,
	`created` text NOT NULL,
	`provider_id` text,
	`error` text
);
