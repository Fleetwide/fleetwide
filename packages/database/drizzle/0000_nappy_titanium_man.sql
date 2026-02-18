CREATE TYPE "public"."repo_source" AS ENUM('github', 'manual_url', 'local_path');--> statement-breakpoint
CREATE TYPE "public"."repo_status" AS ENUM('synced', 'syncing', 'error', 'uninitialized');--> statement-breakpoint
CREATE TABLE "github_app_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"app_id" text NOT NULL,
	"app_slug" text NOT NULL,
	"private_key" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"webhook_secret" text,
	"html_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"account_avatar_url" text,
	"permissions" jsonb,
	"repository_selection" text NOT NULL,
	"suspended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"remote_url" text,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"source" "repo_source" DEFAULT 'manual_url' NOT NULL,
	"status" "repo_status" DEFAULT 'uninitialized' NOT NULL,
	"metadata" jsonb,
	"github_id" integer,
	"github_full_name" text,
	"github_installation_id" text,
	"github_private" boolean,
	"github_html_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_path_unique" UNIQUE("path")
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_github_installation_id_github_installations_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("id") ON DELETE no action ON UPDATE no action;