import { createLogger } from '@fleetwide/core';
import type { AgentEvent, TokenUsage } from '@fleetwide/core';
import type { SessionOrchestrator } from '@fleetwide/workspace-manager';
import { AgentRunner } from '@fleetwide/agent-engine';
import { AgentRunnerService } from '../../ports/services/AgentRunnerService';
import type { SessionsGateway } from '../../interfaces/ws/sessions.gateway';

const logger = createLogger({ name: 'agent-engine-runner' });

export class AgentEngineRunnerService extends AgentRunnerService {
  private runner: AgentRunner;

  constructor(
    private orchestrator: SessionOrchestrator,
    private gateway: SessionsGateway,
    apiKey: string,
  ) {
    super();
    this.runner = new AgentRunner(apiKey, orchestrator);
  }

  async run(opts: {
    sessionId: string;
    prompt: string;
    model: string;
    systemPrompt?: string;
    onEvent?: (event: AgentEvent) => void;
  }): Promise<{ tokenUsage: TokenUsage }> {
    const { sessionId } = opts;

    logger.info({ sessionId, model: opts.model }, 'Starting agent run');

    const result = await this.runner.run({
      ...opts,
      onEvent: (event) => {
        // Forward to WebSocket gateway
        this.forwardEventToGateway(sessionId, event);
        // Forward to caller
        opts.onEvent?.(event);
      },
    });

    logger.info(
      { sessionId, tokenUsage: result.tokenUsage },
      'Agent run completed',
    );

    return result;
  }

  abort(sessionId: string): void {
    this.runner.abort(sessionId);
  }

  private forwardEventToGateway(sessionId: string, event: AgentEvent): void {
    switch (event.type) {
      case 'text': {
        const { content } = event.data as { content: string };
        this.gateway.emitOutput(sessionId, 'stdout', content);
        break;
      }
      case 'tool_use': {
        const { toolName, input } = event.data as {
          toolName: string;
          input: unknown;
        };
        this.gateway.emitOutput(
          sessionId,
          'stdout',
          `[tool: ${toolName}] ${JSON.stringify(input)}`,
        );
        break;
      }
      case 'tool_result': {
        const { toolName, output, isError } = event.data as {
          toolName: string;
          output: string;
          isError: boolean;
        };
        this.gateway.emitOutput(
          sessionId,
          isError ? 'stderr' : 'stdout',
          `[${toolName} result] ${output.slice(0, 1000)}`,
        );
        break;
      }
      case 'cost_update': {
        // Cost updates are not forwarded to WebSocket for now
        break;
      }
    }
  }
}
