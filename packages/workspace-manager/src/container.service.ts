import type Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import type { ContainerExecResult } from '@fleetwide/core';
import { createLogger } from '@fleetwide/core';

const logger = createLogger({ name: 'container-service' });

export class ContainerService {
  constructor(private docker: Docker) {}

  async createAndStart(opts: {
    sessionId: string;
    image: string;
    env: Record<string, string>;
    binds: string[];
    memorySizeMb: number;
    cpuCount: number;
    labels: Record<string, string>;
  }): Promise<{ containerId: string; containerName: string }> {
    const containerName = `fleetwide-session-${opts.sessionId}`;

    // Ensure image is available locally
    await this.ensureImage(opts.image);

    const container = await this.docker.createContainer({
      name: containerName,
      Image: opts.image,
      Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'],
      WorkingDir: '/workspace',
      Env: Object.entries(opts.env).map(([k, v]) => `${k}=${v}`),
      Labels: {
        'fleetwide.managed': 'true',
        'fleetwide.session-id': opts.sessionId,
        ...opts.labels,
      },
      HostConfig: {
        Binds: opts.binds,
        Memory: opts.memorySizeMb * 1024 * 1024,
        MemorySwap: opts.memorySizeMb * 1024 * 1024, // No swap
        NanoCpus: opts.cpuCount * 1_000_000_000,
        NetworkMode: 'bridge',
        AutoRemove: false,
      },
    });

    await container.start();

    const info = await container.inspect();
    logger.info({ containerId: info.Id, containerName }, 'Container started');

    return { containerId: info.Id, containerName };
  }

  async exec(
    containerId: string,
    cmd: string[],
    opts?: { workingDir?: string; env?: string[] },
  ): Promise<ContainerExecResult> {
    const startTime = Date.now();
    const container = this.docker.getContainer(containerId);

    const execInstance = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts?.workingDir ?? '/workspace',
      Env: opts?.env,
    });

    const stream = await execInstance.start({ hijack: false, stdin: false });

    const stdoutPass = new PassThrough();
    const stderrPass = new PassThrough();
    let stdout = '';
    let stderr = '';

    stdoutPass.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    stderrPass.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    this.docker.modem.demuxStream(stream, stdoutPass, stderrPass);

    const exitCode = await this.waitForExec(execInstance);
    const durationMs = Date.now() - startTime;

    return { stdout, stderr, exitCode, durationMs };
  }

  async execStream(
    containerId: string,
    cmd: string[],
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    opts?: { workingDir?: string; env?: string[] },
  ): Promise<number> {
    const container = this.docker.getContainer(containerId);

    const execInstance = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts?.workingDir ?? '/workspace',
      Env: opts?.env,
    });

    const stream = await execInstance.start({ hijack: false, stdin: false });

    const stdoutPass = new PassThrough();
    const stderrPass = new PassThrough();

    stdoutPass.on('data', (chunk: Buffer) => {
      onStdout(chunk.toString('utf8'));
    });
    stderrPass.on('data', (chunk: Buffer) => {
      onStderr(chunk.toString('utf8'));
    });

    this.docker.modem.demuxStream(stream, stdoutPass, stderrPass);

    return this.waitForExec(execInstance);
  }

  async stop(containerId: string, timeoutSeconds = 10): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: timeoutSeconds });
      logger.info({ containerId }, 'Container stopped');
    } catch (err: unknown) {
      // Container already stopped
      if (isDockerError(err) && err.statusCode === 304) {
        return;
      }
      throw err;
    }
  }

  async remove(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.remove({ force: true });
      logger.info({ containerId }, 'Container removed');
    } catch (err: unknown) {
      // Container doesn't exist
      if (isDockerError(err) && err.statusCode === 404) {
        return;
      }
      throw err;
    }
  }

  async getStatus(containerId: string): Promise<'running' | 'stopped' | 'not_found'> {
    const container = this.docker.getContainer(containerId);
    try {
      const info = await container.inspect();
      return info.State.Running ? 'running' : 'stopped';
    } catch (err: unknown) {
      if (isDockerError(err) && err.statusCode === 404) {
        return 'not_found';
      }
      throw err;
    }
  }

  async pruneOrphaned(): Promise<number> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ['fleetwide.managed=true'] },
    });

    let pruned = 0;
    for (const containerInfo of containers) {
      try {
        const container = this.docker.getContainer(containerInfo.Id);
        await container.stop({ t: 5 }).catch(() => {});
        await container.remove({ force: true });
        pruned++;
        logger.info({ containerId: containerInfo.Id }, 'Pruned orphaned container');
      } catch {
        // Best effort
      }
    }

    return pruned;
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
    } catch {
      logger.info({ image }, 'Pulling image...');
      const stream = await this.docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => (err ? reject(err) : resolve()),
        );
      });
      logger.info({ image }, 'Image pulled');
    }
  }

  private async waitForExec(execInstance: Docker.Exec): Promise<number> {
    // Poll exec.inspect() for completion — stream 'end' is unreliable in dockerode
    const maxWaitMs = 600_000; // 10 minutes
    const pollIntervalMs = 100;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const inspectResult = await execInstance.inspect();
      if (!inspectResult.Running) {
        return inspectResult.ExitCode ?? 0;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error('Exec timed out waiting for completion');
  }
}

function isDockerError(err: unknown): err is { statusCode: number } {
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}
