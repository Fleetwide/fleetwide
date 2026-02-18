import { App as OctokitApp, Octokit } from 'octokit';
import { eq } from 'drizzle-orm';
import { generateId } from '@fleetwide/core';
import {
  type Database,
  githubAppConfig,
  githubInstallations,
  type GitHubAppConfigRow,
  type GitHubInstallationRow,
} from '@fleetwide/database';

export interface GitHubAppManifest {
  name: string;
  url: string;
  redirect_url: string;
  hook_attributes: { url: string; active: boolean };
  public: boolean;
  default_permissions: Record<string, string>;
  default_events: string[];
}

export interface GitHubAppCredentials {
  appId: string;
  appSlug: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  htmlUrl: string;
}

export class GitHubAppService {
  private app: OctokitApp | null = null;

  constructor(private db: Database) {}

  /**
   * Try to load stored config from DB and initialize the Octokit App.
   * Safe to call multiple times — no-ops if already initialized.
   */
  async initialize(): Promise<boolean> {
    if (this.app) return true;

    const config = await this.getStoredConfig();
    if (!config) return false;

    this.app = new OctokitApp({
      appId: config.appId,
      privateKey: config.privateKey,
      oauth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
    });

    return true;
  }

  isConfigured(): boolean {
    return this.app !== null;
  }

  async getStoredConfig(): Promise<GitHubAppConfigRow | null> {
    const [row] = await this.db
      .select()
      .from(githubAppConfig)
      .where(eq(githubAppConfig.id, 'default'))
      .limit(1);
    return row ?? null;
  }

  // ---------------------------------------------------------------------------
  // Manifest flow
  // ---------------------------------------------------------------------------

  /**
   * Generate the manifest JSON for GitHub App creation.
   * The callbackUrl is where GitHub redirects after app creation.
   */
  generateManifest(callbackUrl: string): GitHubAppManifest {
    return {
      name: 'Fleetwide',
      url: callbackUrl.replace('/api/github/manifest/callback', ''),
      redirect_url: callbackUrl,
      hook_attributes: {
        url: callbackUrl.replace('/manifest/callback', '/webhooks'),
        active: false,
      },
      public: false,
      default_permissions: {
        contents: 'read',
        metadata: 'read',
      },
      default_events: [],
    };
  }

  /**
   * Build the URL to redirect the user to for GitHub App creation.
   * The user will see a pre-filled "Create GitHub App" form on GitHub.
   */
  getManifestCreationUrl(callbackUrl: string): string {
    const manifest = this.generateManifest(callbackUrl);
    const encoded = encodeURIComponent(JSON.stringify(manifest));
    return `https://github.com/settings/apps/new?manifest=${encoded}`;
  }

  /**
   * Exchange the temporary code from GitHub for full app credentials.
   * GitHub gives us a one-time code after the user creates the app.
   * We POST it to get the App ID, private key, client ID/secret, etc.
   */
  async exchangeManifestCode(code: string): Promise<GitHubAppCredentials> {
    const octokit = new Octokit();
    const response = await octokit.request('POST /app-manifests/{code}/conversions', {
      code,
    });

    const data = response.data as Record<string, unknown>;
    const credentials: GitHubAppCredentials = {
      appId: String(data.id),
      appSlug: data.slug as string,
      privateKey: data.pem as string,
      clientId: data.client_id as string,
      clientSecret: data.client_secret as string,
      webhookSecret: (data.webhook_secret as string) ?? '',
      htmlUrl: data.html_url as string,
    };

    // Store in DB (upsert — replaces existing config if any)
    await this.db
      .insert(githubAppConfig)
      .values({
        id: 'default',
        appId: credentials.appId,
        appSlug: credentials.appSlug,
        privateKey: credentials.privateKey,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        webhookSecret: credentials.webhookSecret,
        htmlUrl: credentials.htmlUrl,
      })
      .onConflictDoUpdate({
        target: githubAppConfig.id,
        set: {
          appId: credentials.appId,
          appSlug: credentials.appSlug,
          privateKey: credentials.privateKey,
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          webhookSecret: credentials.webhookSecret,
          htmlUrl: credentials.htmlUrl,
          updatedAt: new Date(),
        },
      });

    // Re-initialize with new credentials
    this.app = new OctokitApp({
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      oauth: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      },
    });

    return credentials;
  }

  // ---------------------------------------------------------------------------
  // Installation management
  // ---------------------------------------------------------------------------

  /**
   * Get the URL for users to install the GitHub App on their org.
   * Requires the app to be configured first.
   */
  async getInstallUrl(): Promise<string> {
    const config = await this.getStoredConfig();
    if (!config) throw new Error('GitHub App not configured');
    return `https://github.com/apps/${config.appSlug}/installations/new`;
  }

  /**
   * Process a new installation callback from GitHub.
   * Fetches installation details from the GitHub API and stores them.
   */
  async handleInstallationCallback(installationId: number): Promise<GitHubInstallationRow> {
    if (!this.app) {
      await this.initialize();
    }
    if (!this.app) throw new Error('GitHub App not configured');

    const octokit = await this.app.getInstallationOctokit(installationId);
    const { data } = await octokit.request('GET /app/installations/{installation_id}', {
      installation_id: installationId,
    });

    const account = data.account as Record<string, unknown> | null;
    const accountLogin = (account?.login as string) ?? (account?.name as string) ?? 'unknown';
    const accountType = (account?.type as string) ?? 'User';
    const accountAvatarUrl = account?.avatar_url as string | undefined;

    const id = generateId();
    const [row] = await this.db
      .insert(githubInstallations)
      .values({
        id,
        installationId: data.id,
        accountLogin,
        accountType,
        accountAvatarUrl,
        permissions: data.permissions as Record<string, string>,
        repositorySelection: data.repository_selection ?? 'all',
        suspendedAt: data.suspended_at ? new Date(data.suspended_at) : null,
      })
      .onConflictDoUpdate({
        target: githubInstallations.installationId,
        set: {
          accountLogin,
          accountType,
          accountAvatarUrl,
          permissions: data.permissions as Record<string, string>,
          repositorySelection: data.repository_selection ?? 'all',
          suspendedAt: data.suspended_at ? new Date(data.suspended_at) : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row!;
  }

  /** List all stored installations. */
  async getInstallations(): Promise<GitHubInstallationRow[]> {
    return this.db.select().from(githubInstallations).orderBy(githubInstallations.createdAt);
  }

  /** Remove an installation. */
  async removeInstallation(id: string): Promise<void> {
    await this.db.delete(githubInstallations).where(eq(githubInstallations.id, id));
  }

  /** Get installations count. */
  async getInstallationsCount(): Promise<number> {
    const rows = await this.db.select().from(githubInstallations);
    return rows.length;
  }

  /**
   * Get an authenticated Octokit instance for a specific installation.
   * Used for API calls scoped to that installation (repo listing, cloning, etc.).
   */
  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    if (!this.app) {
      await this.initialize();
    }
    if (!this.app) throw new Error('GitHub App not configured');
    return this.app.getInstallationOctokit(installationId);
  }

  /** Disconnect — remove all config and installations. */
  async disconnect(): Promise<void> {
    await this.db.delete(githubInstallations);
    await this.db.delete(githubAppConfig);
    this.app = null;
  }
}
