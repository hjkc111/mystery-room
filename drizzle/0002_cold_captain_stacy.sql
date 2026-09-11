CREATE TABLE `positions` (
	`room` text NOT NULL,
	`player` text NOT NULL,
	`phase` integer NOT NULL,
	`scene` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`seen` integer NOT NULL,
	`seq` integer NOT NULL,
	PRIMARY KEY(`room`, `player`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`room` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`room`, `sender`, `recipient`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `scene` text DEFAULT 'hall' NOT NULL;