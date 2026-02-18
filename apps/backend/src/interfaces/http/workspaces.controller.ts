import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Inject,
  HttpCode,
} from '@nestjs/common';
import { CreateWorkspace } from '../../application/workspaces/CreateWorkspace';
import { UpdateWorkspace } from '../../application/workspaces/UpdateWorkspace';
import { DeleteWorkspace } from '../../application/workspaces/DeleteWorkspace';
import { ManageWorkspaceRepos } from '../../application/workspaces/ManageWorkspaceRepos';
import { WorkspaceQueries } from '../../application/workspaces/WorkspaceQueries';

@Controller('workspaces')
export class WorkspacesController {
  constructor(
    @Inject(CreateWorkspace) private createWorkspace: CreateWorkspace,
    @Inject(UpdateWorkspace) private updateWorkspace: UpdateWorkspace,
    @Inject(DeleteWorkspace) private deleteWorkspace: DeleteWorkspace,
    @Inject(ManageWorkspaceRepos) private manageRepos: ManageWorkspaceRepos,
    @Inject(WorkspaceQueries) private queries: WorkspaceQueries,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown) {
    const workspace = await this.createWorkspace.execute(body);
    return { data: workspace };
  }

  @Get()
  async list() {
    const data = await this.queries.list();
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const workspace = await this.queries.getById(id);
    return { data: workspace };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const workspace = await this.updateWorkspace.execute(id, body);
    return { data: workspace };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.deleteWorkspace.execute(id);
    return { success: true };
  }

  @Post(':id/repos')
  @HttpCode(201)
  async addRepo(@Param('id') id: string, @Body() body: { repositoryId: string }) {
    await this.manageRepos.addRepo(id, body.repositoryId);
    return { success: true };
  }

  @Delete(':id/repos/:repoId')
  async removeRepo(@Param('id') id: string, @Param('repoId') repoId: string) {
    await this.manageRepos.removeRepo(id, repoId);
    return { success: true };
  }
}
