import { describe, it, expect } from 'vitest';
import {
  createTextEvent,
  createToolUseEvent,
  createToolResultEvent,
  createErrorEvent,
  createStatusChangeEvent,
  createCostUpdateEvent,
  isTextEvent,
  isToolUseEvent,
  isToolResultEvent,
  isErrorEvent,
  isStatusChangeEvent,
  isCostUpdateEvent,
} from '../events/agent-events.js';
import {
  agentStartedEvent,
  agentCompletedEvent,
  agentFailedEvent,
  repoSyncedEvent,
  isPlatformEvent,
} from '../events/system-events.js';

describe('Agent events', () => {
  it('should create a text event', () => {
    const event = createTextEvent('Hello world');
    expect(event.type).toBe('text');
    expect(event.data.content).toBe('Hello world');
    expect(typeof event.timestamp).toBe('number');
  });

  it('should create a tool use event', () => {
    const event = createToolUseEvent('tool-1', 'file_read', { path: '/test.ts' });
    expect(event.type).toBe('tool_use');
    expect(event.data.toolId).toBe('tool-1');
    expect(event.data.toolName).toBe('file_read');
    expect(event.data.input).toEqual({ path: '/test.ts' });
  });

  it('should create a tool result event', () => {
    const event = createToolResultEvent('tool-1', 'file_read', 'file contents', false);
    expect(event.type).toBe('tool_result');
    expect(event.data.isError).toBe(false);
  });

  it('should create an error event', () => {
    const event = createErrorEvent('AGENT_ERROR', 'Something went wrong');
    expect(event.type).toBe('error');
    expect(event.data.code).toBe('AGENT_ERROR');
    expect(event.data.message).toBe('Something went wrong');
  });

  it('should create a status change event', () => {
    const event = createStatusChangeEvent('idle', 'running');
    expect(event.type).toBe('status_change');
    expect(event.data.previousStatus).toBe('idle');
    expect(event.data.newStatus).toBe('running');
  });

  it('should create a cost update event', () => {
    const event = createCostUpdateEvent(100, 50, 0.003);
    expect(event.type).toBe('cost_update');
    expect(event.data.inputTokens).toBe(100);
    expect(event.data.outputTokens).toBe(50);
    expect(event.data.totalCostUsd).toBe(0.003);
  });

  describe('type guards', () => {
    it('should correctly identify text events', () => {
      const event = createTextEvent('test');
      expect(isTextEvent(event)).toBe(true);
      expect(isToolUseEvent(event)).toBe(false);
    });

    it('should correctly identify tool use events', () => {
      const event = createToolUseEvent('id', 'name', {});
      expect(isToolUseEvent(event)).toBe(true);
      expect(isTextEvent(event)).toBe(false);
    });

    it('should correctly identify tool result events', () => {
      const event = createToolResultEvent('id', 'name', 'output');
      expect(isToolResultEvent(event)).toBe(true);
    });

    it('should correctly identify error events', () => {
      const event = createErrorEvent('CODE', 'msg');
      expect(isErrorEvent(event)).toBe(true);
    });

    it('should correctly identify status change events', () => {
      const event = createStatusChangeEvent('idle', 'running');
      expect(isStatusChangeEvent(event)).toBe(true);
    });

    it('should correctly identify cost update events', () => {
      const event = createCostUpdateEvent(0, 0, 0);
      expect(isCostUpdateEvent(event)).toBe(true);
    });
  });
});

describe('System events', () => {
  it('should create agent started event', () => {
    const event = agentStartedEvent('session-1', 'repo-1');
    expect(event.type).toBe('agent.started');
    expect(event.data.sessionId).toBe('session-1');
    expect(event.data.repositoryId).toBe('repo-1');
  });

  it('should create agent completed event', () => {
    const event = agentCompletedEvent('session-1', 'repo-1', 0.05);
    expect(event.type).toBe('agent.completed');
    expect(event.data.costUsd).toBe(0.05);
  });

  it('should create agent failed event', () => {
    const event = agentFailedEvent('session-1', 'timeout');
    expect(event.type).toBe('agent.failed');
    expect(event.data.error).toBe('timeout');
  });

  it('should create repo synced event', () => {
    const event = repoSyncedEvent('repo-1', 5);
    expect(event.type).toBe('repo.synced');
    expect(event.data.updatedFiles).toBe(5);
  });

  it('should validate platform events', () => {
    const event = agentStartedEvent('session-1');
    expect(isPlatformEvent(event)).toBe(true);
    expect(isPlatformEvent(null)).toBe(false);
    expect(isPlatformEvent({ type: 'test' })).toBe(false);
  });
});
