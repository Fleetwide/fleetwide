import { createLogger, NotFoundError, ValidationError } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import type { SessionRepository } from '../../ports/repositories/SessionRepository';
import type { AgentRunnerService } from '../../ports/services/AgentRunnerService';

const logger = createLogger({ name: 'run-agent' });

export class RunAgent {
  constructor(
    private sessionRepo: SessionRepository,
    private agentRunner: AgentRunnerService,
    private orchestrator: SessionOrchestrator,
  ) {}

  async execute(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.status !== 'running') {
      throw new ValidationError(
        `Session must be in running state to run agent (current: ${session.status})`,
      );
    }

    const model = session.model ?? 'claude-sonnet-4-20250514';
    const prompt = session.prompt;

    // Fire and forget — the agent runs in the background.
    // The runner handles status transitions, message persistence, and errors.
    void this.agentRunner
      .run({
        sessionId,
        prompt,
        model,
        systemPrompt: session.systemPrompt ?? undefined,
      })
      .then(async (result) => {
        // Update cost tracking in DB
        await this.updateSessionCost(sessionId, result.tokenUsage);

        // Auto-finalize after agent completes
        try {
          await this.orchestrator.finalizeSession(sessionId);
        } catch (err) {
          logger.error(
            { sessionId, error: err instanceof Error ? err.message : err },
            'Failed to finalize session after agent run',
          );
        }
      })
      .catch(async (err) => {
        logger.error(
          { sessionId, error: err instanceof Error ? err.message : err },
          'Agent run failed',
        );
        // The orchestrator's session row may need a status update.
        // Attempt to mark as failed if not already in a terminal state.
        try {
          const current = await this.sessionRepo.findById(sessionId);
          if (
            current &&
            !['failed', 'completed', 'approved', 'rejected', 'expired'].includes(
              current.status,
            )
          ) {
            await this.orchestrator.destroyContainer(sessionId, 'user');
          }
        } catch {
          // Best effort
        }
      });

    return { started: true, sessionId };
  }

  async abort(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    this.agentRunner.abort(sessionId);
    return { aborted: true, sessionId };
  }

  private async updateSessionCost(
    sessionId: string,
    tokenUsage: { costUsd: number; totalTokens: number },
  ): Promise<void> {
    // We use the orchestrator's getSession to confirm it exists,
    // then the sessionRepo doesn't have an update method for cost.
    // We'll need to use the DB directly — but per hexagonal architecture,
    // this should go through the orchestrator or a dedicated method.
    // For now, log it. A dedicated method can be added later.
    logger.info(
      {
        sessionId,
        costUsd: tokenUsage.costUsd,
        totalTokens: tokenUsage.totalTokens,
      },
      'Agent run cost',
    );
  }
}
