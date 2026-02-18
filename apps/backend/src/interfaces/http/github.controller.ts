import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Inject,
  Res,
  HttpCode,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import type {
  GitHubAppService,
  GitHubDiscoveryService,
  GitHubImportService,
} from '@fleetwide/repo-manager';
import { TOKENS } from '../../core/injection-tokens';

@Controller('github')
export class GitHubController {
  constructor(
    @Inject(TOKENS.GITHUB_APP_SERVICE)
    private appService: GitHubAppService,
    @Inject(TOKENS.GITHUB_DISCOVERY_SERVICE)
    private discoveryService: GitHubDiscoveryService,
    @Inject(TOKENS.GITHUB_IMPORT_SERVICE)
    private importService: GitHubImportService,
    private config: ConfigService,
  ) {}

  @Get('status')
  async getStatus() {
    const storedConfig = await this.appService.getStoredConfig();
    return {
      configured: !!storedConfig,
      appSlug: storedConfig?.appSlug ?? null,
      htmlUrl: storedConfig?.htmlUrl ?? null,
      installationsCount: storedConfig
        ? await this.appService.getInstallationsCount()
        : 0,
    };
  }

  @Get('manifest/start')
  getManifestStart(@Req() req: Request) {
    const callbackUrl = `${this.getBaseUrl(req)}/api/github/manifest/callback`;
    const url = this.appService.getManifestCreationUrl(callbackUrl);
    return { url };
  }

  @Get('manifest/callback')
  async manifestCallback(
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Missing code parameter');
    }

    await this.appService.exchangeManifestCode(code);
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings/github?setup=complete`);
  }

  @Delete('config')
  async disconnect() {
    await this.appService.disconnect();
    return { success: true };
  }

  @Get('install-url')
  async getInstallUrl() {
    const url = await this.appService.getInstallUrl();
    return { url };
  }

  @Get('installations')
  async getInstallations() {
    const installations = await this.appService.getInstallations();
    return { installations };
  }

  @Get('installations/callback')
  async installationsCallback(
    @Query('installation_id') installationId: string,
    @Res() res: Response,
  ) {
    const id = Number(installationId);
    if (!id) {
      throw new BadRequestException('Missing installation_id');
    }

    await this.appService.initialize();
    await this.appService.handleInstallationCallback(id);
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    res.redirect(`${frontendUrl}/import`);
  }

  @Delete('installations/:id')
  async removeInstallation(@Param('id') id: string) {
    await this.appService.removeInstallation(id);
    return { success: true };
  }

  @Get('repos')
  async discoverAllRepos() {
    await this.appService.initialize();
    const repos = await this.discoveryService.discoverAllRepos();
    return { repos };
  }

  @Get('repos/:installationId')
  async discoverRepos(@Param('installationId') installationId: string) {
    await this.appService.initialize();
    const repos = await this.discoveryService.discoverRepos(Number(installationId));
    return { repos };
  }

  @Post('repos/import')
  @HttpCode(201)
  async importRepos(@Body() body: { installationId: number; repos: unknown[] }) {
    await this.appService.initialize();
    const basePath = this.config.get<string>('REPOS_BASE_PATH') ?? './repos';
    const results = await this.importService.importRepos({
      installationId: body.installationId,
      repos: body.repos as Parameters<GitHubImportService['importRepos']>[0]['repos'],
      basePath,
    });
    return { results };
  }

  private getBaseUrl(req: Request): string {
    const forwarded = req.headers['x-forwarded-host'] as string | undefined;
    if (forwarded) {
      const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
      return `${proto}://${forwarded}`;
    }
    const port = this.config.get<number>('PORT') ?? 8080;
    return `http://localhost:${port}`;
  }
}
