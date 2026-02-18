import type { AgentEvent, TokenUsage } from '@fleetwide/core';

export abstract class AgentRunnerService {
  abstract run(opts: {
    sessionId: string;
    prompt: string;
    model: string;
    systemPrompt?: string;
    onEvent?: (event: AgentEvent) => void;
  }): Promise<{ tokenUsage: TokenUsage }>;

  abstract abort(sessionId: string): void;
}
