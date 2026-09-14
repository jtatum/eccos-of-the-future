CREATE TABLE `ecco_laboratory_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`mode` text NOT NULL,
	`participant_kind` text NOT NULL,
	`contributor_handle` text,
	`title` text NOT NULL,
	`question` text NOT NULL,
	`desired_change` text NOT NULL,
	`experiment_url` text,
	`boundary` text NOT NULL,
	`content_digest` text NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ecco_laboratory_proposals_digest` ON `ecco_laboratory_proposals` (`content_digest`);--> statement-breakpoint
CREATE INDEX `idx_ecco_laboratory_proposals_created_at` ON `ecco_laboratory_proposals` (`created_at`);