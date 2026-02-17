/**
 * Agent event definitions.
 *
 * These events are emitted during agent execution and streamed
 * to clients over WebSocket for real-time updates.
 */

import type {
  AgentEvent,
  AgentStatus,
  TextEvent,
  ToolUseEvent,
  ToolResultEvent,
  ErrorEvent,
  StatusChangeEvent,
  CostUpdateEvent,
} from '../types/agent.js';

// ---------------------------------------------------------------------------
// Event factory functions
// ---------------------------------------------------------------------------

export function createTextEvent(content: string): TextEvent {
  return {
    type: 'text',
    timestamp: Date.now(),
    data: { content },
  };
}

export function createToolUseEvent(
  toolId: string,
  toolName: string,
  input: unknown,
): ToolUseEvent {
  return {
    type: 'tool_use',
    timestamp: Date.now(),
    data: { toolId, toolName, input },
  };
}

export function createToolResultEvent(
  toolId: string,
  toolName: string,
  output: unknown,
  isError = false,
): ToolResultEvent {
  return {
    type: 'tool_result',
    timestamp: Date.now(),
    data: { toolId, toolName, output, isError },
  };
}

export function createErrorEvent(code: string, message: string): ErrorEvent {
  return {
    type: 'error',
    timestamp: Date.now(),
    data: { code, message },
  };
}

export function createStatusChangeEvent(
  previousStatus: AgentStatus,
  newStatus: AgentStatus,
): StatusChangeEvent {
  return {
    type: 'status_change',
    timestamp: Date.now(),
    data: { previousStatus, newStatus },
  };
}

export function createCostUpdateEvent(
  inputTokens: number,
  outputTokens: number,
  totalCostUsd: number,
): CostUpdateEvent {
  return {
    type: 'cost_update',
    timestamp: Date.now(),
    data: { inputTokens, outputTokens, totalCostUsd },
  };
}

// ---------------------------------------------------------------------------
// Event type guards
// ---------------------------------------------------------------------------

export function isTextEvent(event: AgentEvent): event is TextEvent {
  return event.type === 'text';
}

export function isToolUseEvent(event: AgentEvent): event is ToolUseEvent {
  return event.type === 'tool_use';
}

export function isToolResultEvent(event: AgentEvent): event is ToolResultEvent {
  return event.type === 'tool_result';
}

export function isErrorEvent(event: AgentEvent): event is ErrorEvent {
  return event.type === 'error';
}

export function isStatusChangeEvent(event: AgentEvent): event is StatusChangeEvent {
  return event.type === 'status_change';
}

export function isCostUpdateEvent(event: AgentEvent): event is CostUpdateEvent {
  return event.type === 'cost_update';
}
