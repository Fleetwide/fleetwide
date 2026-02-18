import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Inject,
  HttpCode,
} from '@nestjs/common';
import { validate, paginationSchema, repoFilterSchema, NotFoundError } from '@fleetwide/core';
import type { RepoRegistry } from '@fleetwide/repo-manager';
import { TOKENS } from '../../core/injection-tokens';
import { SyncRepo } from '../../application/repos/SyncRepo';

@Controller('repos')
export class ReposController {
  constructor(
    @Inject(TOKENS.REPO_REGISTRY)
    private repoRegistry: RepoRegistry,
    @Inject(SyncRepo)
    private syncRepo: SyncRepo,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const filterResult = validate(repoFilterSchema, { status, search });
    const paginationResult = validate(paginationSchema, {
      page,
      limit,
      sortBy,
      sortOrder,
    });

    const filter = filterResult.success ? filterResult.data : undefined;
    const pagination = paginationResult.success ? paginationResult.data : undefined;

    return this.repoRegistry.list(filter, pagination);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const repo = await this.repoRegistry.getById(id);
    if (!repo) {
      throw new NotFoundError('Repository not found');
    }
    return { data: repo };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const repo = await this.repoRegistry.getById(id);
    if (!repo) {
      throw new NotFoundError('Repository not found');
    }
    await this.repoRegistry.remove(id);
    return { success: true };
  }

  @Post(':id/sync')
  @HttpCode(200)
  async sync(@Param('id') id: string) {
    const result = await this.syncRepo.execute(id);
    return { data: result };
  }
}
