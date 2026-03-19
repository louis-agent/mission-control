-- Migration 0000: Initial schema (agents, workflows, tasks, execution_runs, events)
CREATE TABLE IF NOT EXISTS `agents` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `capabilities` text DEFAULT '[]' NOT NULL,
  `status` text DEFAULT 'idle' NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `last_heartbeat_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `workflows` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `steps` text DEFAULT '[]' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `priority` text DEFAULT 'medium' NOT NULL,
  `required_capabilities` text DEFAULT '[]' NOT NULL,
  `assignee_agent_id` text,
  `workflow_id` text,
  `execution_run_id` text,
  `step_id` text,
  `dependencies` text DEFAULT '[]' NOT NULL,
  `input` text DEFAULT '{}' NOT NULL,
  `output` text DEFAULT '{}' NOT NULL,
  `error_message` text,
  `max_retries` integer DEFAULT 0 NOT NULL,
  `retry_count` integer DEFAULT 0 NOT NULL,
  `retry_delay` integer DEFAULT 1000 NOT NULL,
  `timeout_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `execution_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `workflow_id` text NOT NULL,
  `parent_run_id` text,
  `parent_step_id` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `cancelled_at` integer,
  `timeout_at` integer,
  `step_results` text DEFAULT '[]' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `events` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `source` text NOT NULL,
  `payload` text DEFAULT '{}' NOT NULL,
  `timestamp` integer NOT NULL,
  `created_at` integer NOT NULL
);
