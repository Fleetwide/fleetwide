import type Anthropic from '@anthropic-ai/sdk';
import type { ContainerExecutor } from '../types.js';

export class ContainerFileTool {
  constructor(private executor: ContainerExecutor) {}

  static readDefinition: Anthropic.Tool = {
    name: 'read_file',
    description:
      'Read the contents of a file inside the workspace container. ' +
      'Returns the full file contents as text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the file inside the container',
        },
      },
      required: ['path'],
    },
  };

  static writeDefinition: Anthropic.Tool = {
    name: 'write_file',
    description:
      'Write content to a file inside the workspace container. ' +
      'Creates the file if it does not exist, or overwrites it if it does. ' +
      'Parent directories are created automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the file inside the container',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  };

  static listDefinition: Anthropic.Tool = {
    name: 'list_files',
    description:
      'List files and directories at a given path inside the workspace container. ' +
      'Returns a listing with file types and sizes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the directory inside the container',
        },
      },
      required: ['path'],
    },
  };

  async readFile(sessionId: string, input: { path: string }): Promise<string> {
    const result = await this.executor.exec(sessionId, [
      '/bin/sh',
      '-c',
      `cat ${this.escapePath(input.path)}`,
    ]);

    if (result.exitCode !== 0) {
      return `Error reading file: ${result.stderr || 'file not found'}`;
    }
    return result.stdout;
  }

  async writeFile(
    sessionId: string,
    input: { path: string; content: string },
  ): Promise<string> {
    // Create parent directories
    const dir = input.path.substring(0, input.path.lastIndexOf('/'));
    if (dir) {
      await this.executor.exec(sessionId, [
        '/bin/sh',
        '-c',
        `mkdir -p ${this.escapePath(dir)}`,
      ]);
    }

    // Write file using heredoc to handle special characters
    const result = await this.executor.exec(sessionId, [
      '/bin/sh',
      '-c',
      `cat > ${this.escapePath(input.path)} << 'FLEETWIDE_EOF'\n${input.content}\nFLEETWIDE_EOF`,
    ]);

    if (result.exitCode !== 0) {
      return `Error writing file: ${result.stderr}`;
    }
    return `File written successfully: ${input.path}`;
  }

  async listFiles(sessionId: string, input: { path: string }): Promise<string> {
    const result = await this.executor.exec(sessionId, [
      '/bin/sh',
      '-c',
      `ls -la ${this.escapePath(input.path)}`,
    ]);

    if (result.exitCode !== 0) {
      return `Error listing directory: ${result.stderr || 'directory not found'}`;
    }
    return result.stdout;
  }

  private escapePath(path: string): string {
    // Shell-escape the path to prevent injection
    return `'${path.replace(/'/g, "'\\''")}'`;
  }
}
