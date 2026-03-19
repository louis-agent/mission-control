-- Migration 0002: Webhooks table
CREATE TABLE IF NOT EXISTS `webhooks` (
  `id` text PRIMARY KEY NOT NULL,
  `url` text NOT NULL,
  `events` text DEFAULT '[]' NOT NULL,
  `secret` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
