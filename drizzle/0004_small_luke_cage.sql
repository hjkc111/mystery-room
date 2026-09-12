CREATE TABLE `activities` (
	`room` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `simulation` (
	`room` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL,
	`lease` text,
	`until` integer DEFAULT 0 NOT NULL
);
