import type {
  ContainerExecResult,
  SessionMessage,
  AgentEvent,
  TokenUsage,
} from '@fleetwide/core';

/**
 * Abstraction over container execution. The backend passes in the
 * SessionOrchestrator which structurally satisfies this interface.
 */
export interface ContainerExecutor {
  exec(
    sessionId: string,
    cmd: string[],
    opts?: { workingDir?: string },
  ): Promise<ContainerExecResult>;

  persistMessage(sessionId: string, message: SessionMessage): Promise<void>;
}

export interface AgentRunnerOptions {
  sessionId: string;
  prompt: string;
  model: string;
  systemPrompt?: string;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentRunResult {
  tokenUsage: TokenUsage;
}
