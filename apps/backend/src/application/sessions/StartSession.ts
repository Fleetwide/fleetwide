import {
  validate,
  runAgentInWorkspaceSchema,
  generateId,
  NotFoundError,
  ValidationError,
} from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import { WorkspaceRepository } from '../../ports/repositories/WorkspaceRepository';

export class StartSession {
  constructor(
    private workspaceRepo: WorkspaceRepository,
    private orchestrator: SessionOrchestrator,
  ) {}

  async execute(body: unknown) {
    const result = validate(runAgentInWorkspaceSchema, body);
    if (!result.success) {
      throw new ValidationError('Invalid session data', result.errors);
    }

    const { workspaceId, prompt, providerId, model, systemPrompt } = result.data;

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    if (workspace.status !== 'active') {
      throw new ValidationError('Workspace is not active', {
        status: workspace.status,
      });
    }

    const sessionId = generateId();

    const { containerId, containerName } =
      await this.orchestrator.startSession({
        workspaceId,
        sessionId,
        prompt,
        providerId,
        model,
        systemPrompt,
      });

    return {
      sessionId,
      containerId,
      containerName,
      status: 'running' as const,
    };
  }
}
