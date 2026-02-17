/**
 * Agent types for the multi-provider agent orchestration system.
 *
 * The agent system is provider-agnostic: Claude, OpenAI, and future providers
 * all implement the same AgentProvider interface.
 */

import type { ID, Timestamps } from './common.js';

// ---------------------------------------------------------------------------
// Agent status lifecycle
// ---------------------------------------------------------------------------

export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';

// ---------------------------------------------------------------------------
// Agent events (streamed over WebSocket)
// ---------------------------------------------------------------------------

export type AgentEventType =
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'status_change'
  | 'cost_update';

export interface AgentEvent {
  type: AgentEventType;
  timestamp: number;
  data: unknown;
}

export interface TextEvent extends AgentEvent {
  type: 'text';
  data: { content: string };
}

export interface ToolUseEvent extends AgentEvent {
  type: 'tool_use';
  data: {
    toolId: string;
    toolName: string;
    input: unknown;
  };
}

export interface ToolResultEvent extends AgentEvent {
  type: 'tool_result';
  data: {
    toolId: string;
    toolName: string;
    output: unknown;
    isError: boolean;
  };
}

export interface ErrorEvent extends AgentEvent {
  type: 'error';
  data: {
    code: string;
    message: string;
  };
}

export interface StatusChangeEvent extends AgentEvent {
  type: 'status_change';
  data: {
    previousStatus: AgentStatus;
    newStatus: AgentStatus;
  };
}

export interface CostUpdateEvent extends AgentEvent {
  type: 'cost_update';
  data: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  };
}

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

export interface AgentPermissions {
  allowFileRead: boolean;
  allowFileWrite: boolean;
  allowBashExecution: boolean;
  allowNetworkAccess: boolean;
  restrictedPaths?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentConfig {
  providerId: string;
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
  workingDirectory: string;
  permissions: AgentPermissions;
}

// ---------------------------------------------------------------------------
// Agent instance (persisted)
// ---------------------------------------------------------------------------

export interface Agent extends Timestamps {
  id: ID;
  name: string;
  providerId: string;
  model: string;
  systemPrompt?: string;
  config?: Record<string, unknown>;
  status: AgentStatus;
}

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  maxConcurrentRequests?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ConversationOptions {
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
  workingDirectory: string;
}

export interface AgentConversation {
  sendMessage(prompt: string): AsyncIterable<AgentEvent>;
  abort(): void;
  getTokenUsage(): TokenUsage;
}

export interface AgentProvider {
  readonly id: string;
  readonly name: string;
  readonly models: string[];

  initialize(config: ProviderConfig): Promise<void>;
  createConversation(options: ConversationOptions): AgentConversation;
  validateConfig(config: ProviderConfig): boolean;
}

// ---------------------------------------------------------------------------
// Session (agent conversation)
// ---------------------------------------------------------------------------

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  events?: AgentEvent[];
}

export interface Session extends Timestamps {
  id: ID;
  agentId?: ID;
  repositoryId?: ID;
  name?: string;
  messages: SessionMessage[];
  status: 'active' | 'completed' | 'failed' | 'aborted';
  costUsd: number;
  tokenCount: number;
}
