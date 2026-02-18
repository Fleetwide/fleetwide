CREATE TYPE "public"."session_status" AS ENUM('starting', 'setup', 'running', 'finalizing', 'preview', 'approved', 'rejected', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'error', 'archived');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"container_id" text,
	"container_name" text,
	"status" "session_status" DEFAULT 'starting' NOT NULL,
	"prompt" text NOT NULL,
	"provider_id" text DEFAULT 'claude' NOT NULL,
	"model" text,
	"system_prompt" text,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"branch_name" text,
	"branch_pushed" boolean DEFAULT false,
	"pr_url" text,
	"pr_number" integer,
	"diff_summary" jsonb,
	"setup_logs" jsonb DEFAULT '[]'::jsonb,
	"cost_usd" numeric(10, 6) DEFAULT '0',
	"token_count" integer DEFAULT 0,
	"idle_timeout_minutes" integer DEFAULT 30 NOT NULL,
	"last_activity_at" timestamp,
	"container_destroyed_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workspace_repos" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"mount_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image" text NOT NULL,
	"setup_commands" jsonb DEFAULT '[]'::jsonb,
	"environment_variables" jsonb DEFAULT '{}'::jsonb,
	"memory_size_mb" integer DEFAULT 512 NOT NULL,
	"cpu_count" integer DEFAULT 1 NOT NULL,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_repos" ADD CONSTRAINT "workspace_repos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_repos" ADD CONSTRAINT "workspace_repos_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;