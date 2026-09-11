CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`host` text NOT NULL,
	`phase` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seats` (
	`room` text NOT NULL,
	`player` text NOT NULL,
	`seen` integer NOT NULL,
	PRIMARY KEY(`room`, `player`)
);
--> statement-breakpoint
CREATE INDEX `seats_player` ON `seats` (`player`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`created` integer NOT NULL
);
