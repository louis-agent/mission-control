-- Migration 0001: Security tables (api_keys, audit_log)
CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `hashed_key` text NOT NULL UNIQUE,
  `agent_id` text,
  `role` text DEFAULT 'viewer' NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer,
  `revoked_at` integer
);

CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text,
  `actor_type` text NOT NULL,
  `action` text NOT NULL,
  `resource_type` text NOT NULL,
  `resource_id` text,
  `metadata` text DEFAULT '{}' NOT NULL,
  `timestamp` integer NOT NULL
);
