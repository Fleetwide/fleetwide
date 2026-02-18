import type Anthropic from '@anthropic-ai/sdk';
import type { ContainerExecutor } from '../types.js';

export class ContainerBashTool {
  constructor(private executor: ContainerExecutor) {}

  static definition: Anthropic.Tool = {
    name: 'bash',
    description:
      'Execute a bash command inside the workspace container. ' +
      'Use this to run shell commands, install packages, run tests, build projects, etc. ' +
      'The command runs in /bin/sh -c. Working directory defaults to /workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute',
        },
        working_dir: {
          type: 'string',
          description: 'Working directory for the command (default: /workspace)',
        },
      },
      required: ['command'],
    },
  };

  async execute(
    sessionId: string,
    input: { command: string; working_dir?: string },
  ): Promise<string> {
    const result = await this.executor.exec(
      sessionId,
      ['/bin/sh', '-c', input.command],
      input.working_dir ? { workingDir: input.working_dir } : undefined,
    );

    const parts: string[] = [];
    if (result.stdout) parts.push(result.stdout);
    if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
    parts.push(`[exit code: ${result.exitCode}]`);

    return parts.join('\n');
  }
}
