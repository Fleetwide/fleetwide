import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Inject,
  HttpCode,
} from '@nestjs/common';
import { StartSession } from '../../application/sessions/StartSession';
import { FinalizeSession } from '../../application/sessions/FinalizeSession';
import { ApproveSession } from '../../application/sessions/ApproveSession';
import { RejectSession } from '../../application/sessions/RejectSession';
import { ExecInSession } from '../../application/sessions/ExecInSession';
import { DestroySession } from '../../application/sessions/DestroySession';
import { SessionQueries } from '../../application/sessions/SessionQueries';

@Controller('sessions')
export class SessionsController {
  constructor(
    @Inject(StartSession) private startSession: StartSession,
    @Inject(FinalizeSession) private finalizeSession: FinalizeSession,
    @Inject(ApproveSession) private approveSession: ApproveSession,
    @Inject(RejectSession) private rejectSession: RejectSession,
    @Inject(ExecInSession) private execInSession: ExecInSession,
    @Inject(DestroySession) private destroySession: DestroySession,
    @Inject(SessionQueries) private queries: SessionQueries,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown) {
    const data = await this.startSession.execute(body);
    return { data };
  }

  @Get()
  async list(
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.queries.list({ workspaceId, status });
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.queries.getById(id);
    return { data };
  }

  @Post(':id/exec')
  @HttpCode(200)
  async exec(@Param('id') id: string, @Body() body: { cmd: string[] }) {
    const data = await this.execInSession.execute(id, body.cmd);
    return { data };
  }

  @Delete(':id')
  async destroy(@Param('id') id: string) {
    await this.destroySession.execute(id);
    return { success: true };
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string) {
    const data = await this.queries.getMessages(id);
    return { data };
  }

  @Get(':id/logs')
  async getLogs(@Param('id') id: string) {
    const data = await this.queries.getLogs(id);
    return { data };
  }

  @Get(':id/diff')
  async getDiff(@Param('id') id: string) {
    const data = await this.queries.getDiff(id);
    return { data };
  }

  @Get(':id/branch')
  async getBranch(@Param('id') id: string) {
    const data = await this.queries.getBranch(id);
    return { data };
  }

  @Post(':id/finalize')
  @HttpCode(200)
  async finalize(@Param('id') id: string) {
    const data = await this.finalizeSession.execute(id);
    return { data };
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id') id: string) {
    const data = await this.approveSession.execute(id);
    return { data };
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string) {
    const data = await this.rejectSession.execute(id);
    return { data };
  }
}
