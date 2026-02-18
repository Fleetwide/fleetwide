import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@fleetwide/core';
import type { AgentEvent, SessionMessage } from '@fleetwide/core';
import type { ContainerExecutor, AgentRunnerOptions, AgentRunResult } from './types.js';
import { ContainerBashTool } from './tools/container-bash.tool.js';
import { ContainerFileTool } from './tools/container-file.tool.js';
import { CostTracker } from './cost-tracker.js';

const logger = createLogger({ name: 'agent-runner' });

const MAX_TURNS = 100;
const DEFAULT_MAX_TOKENS = 8192;

export class AgentRunner {
  private client: Anthropic;
  private bashTool: ContainerBashTool;
  private fileTool: ContainerFileTool;
  private abortControllers = new Map<string, AbortController>();

  constructor(apiKey: string, private executor: ContainerExecutor) {
    this.client = new Anthropic({ apiKey });
    this.bashTool = new ContainerBashTool(executor);
    this.fileTool = new ContainerFileTool(executor);
  }

  async run(opts: AgentRunnerOptions): Promise<AgentRunResult> {
    const { sessionId, prompt, model, systemPrompt, onEvent } = opts;

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    const costTracker = new CostTracker(model);
    const tools = this.getToolDefinitions();
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: prompt },
    ];

    // Persist the user message
    await this.executor.persistMessage(sessionId, {
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    });

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        if (abortController.signal.aborted) {
          logger.info({ sessionId }, 'Agent run aborted');
          break;
        }

        const response = await this.client.messages.create({
          model,
          max_tokens: DEFAULT_MAX_TOKENS,
          system: systemPrompt ?? this.getDefaultSystemPrompt(),
          messages,
          tools,
        });

        costTracker.add(response.usage);
        this.emitCostUpdate(onEvent, costTracker);

        // Process response content blocks
        const textParts: string[] = [];
        const events: AgentEvent[] = [];
        const toolCalls: Anthropic.ContentBlock[] = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            textParts.push(block.text);
            const event: AgentEvent = {
              type: 'text',
              timestamp: Date.now(),
              data: { content: block.text },
            };
            events.push(event);
            onEvent?.(event);
          } else if (block.type === 'tool_use') {
            toolCalls.push(block);
            const event: AgentEvent = {
              type: 'tool_use',
              timestamp: Date.now(),
              data: {
                toolId: block.id,
                toolName: block.name,
                input: block.input,
              },
            };
            events.push(event);
            onEvent?.(event);
          }
        }

        // Persist assistant message
        const assistantMessage: SessionMessage = {
          role: 'assistant',
          content: textParts.join('\n'),
          timestamp: Date.now(),
          events,
        };
        await this.executor.persistMessage(sessionId, assistantMessage);

        // Add assistant response to conversation history
        messages.push({ role: 'assistant', content: response.content });

        // If no tool calls or end_turn, we're done
        if (response.stop_reason === 'end_turn' || toolCalls.length === 0) {
          logger.info({ sessionId, turns: turn + 1 }, 'Agent completed');
          break;
        }

        // Execute tool calls
        if (abortController.signal.aborted) break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        const toolResultEvents: AgentEvent[] = [];

        for (const block of toolCalls) {
          if (block.type !== 'tool_use') continue;
          if (abortController.signal.aborted) break;

          const { output, isError } = await this.executeToolCall(
            sessionId,
            block.name,
            block.input as Record<string, unknown>,
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: output,
            is_error: isError,
          });

          const event: AgentEvent = {
            type: 'tool_result',
            timestamp: Date.now(),
            data: {
              toolId: block.id,
              toolName: block.name,
              output,
              isError,
            },
          };
          toolResultEvents.push(event);
          onEvent?.(event);
        }

        // Persist tool results as a user message (Claude expects alternating roles)
        if (toolResultEvents.length > 0) {
          const toolResultMessage: SessionMessage = {
            role: 'user',
            content: '[tool results]',
            timestamp: Date.now(),
            events: toolResultEvents,
          };
          await this.executor.persistMessage(sessionId, toolResultMessage);
        }

        messages.push({ role: 'user', content: toolResults });
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }

    return { tokenUsage: costTracker.getUsage() };
  }

  abort(sessionId: string): void {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      logger.info({ sessionId }, 'Agent abort requested');
    }
  }

  private getToolDefinitions(): Anthropic.Tool[] {
    return [
      ContainerBashTool.definition,
      ContainerFileTool.readDefinition,
      ContainerFileTool.writeDefinition,
      ContainerFileTool.listDefinition,
    ];
  }

  private async executeToolCall(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<{ output: string; isError: boolean }> {
    try {
      let output: string;

      switch (toolName) {
        case 'bash':
          output = await this.bashTool.execute(
            sessionId,
            input as { command: string; working_dir?: string },
          );
          break;
        case 'read_file':
          output = await this.fileTool.readFile(
            sessionId,
            input as { path: string },
          );
          break;
        case 'write_file':
          output = await this.fileTool.writeFile(
            sessionId,
            input as { path: string; content: string },
          );
          break;
        case 'list_files':
          output = await this.fileTool.listFiles(
            sessionId,
            input as { path: string },
          );
          break;
        default:
          return { output: `Unknown tool: ${toolName}`, isError: true };
      }

      return { output, isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ sessionId, toolName, error: message }, 'Tool execution failed');
      return { output: `Tool execution error: ${message}`, isError: true };
    }
  }

  private getDefaultSystemPrompt(): string {
    return [
      'You are an AI coding agent working inside a Docker container.',
      'You have access to tools for executing bash commands, reading files, writing files, and listing directories.',
      'All file paths are relative to /workspace/ which contains the cloned repositories.',
      'Complete the task described in the user prompt by making the necessary code changes.',
      'After making changes, verify your work by running tests or other validation commands.',
    ].join(' ');
  }

  private emitCostUpdate(
    onEvent: ((event: AgentEvent) => void) | undefined,
    costTracker: CostTracker,
  ): void {
    if (!onEvent) return;
    const usage = costTracker.getUsage();
    onEvent({
      type: 'cost_update',
      timestamp: Date.now(),
      data: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalCostUsd: usage.costUsd,
      },
    });
  }
}
