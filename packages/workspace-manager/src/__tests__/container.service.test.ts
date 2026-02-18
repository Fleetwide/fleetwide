import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerService } from '../container.service.js';

// Mock dockerode
function createMockDocker() {
  const mockContainer = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      Id: 'container-123',
      State: { Running: true },
    }),
    exec: vi.fn(),
  };

  const mockExecInstance = {
    start: vi.fn(),
    inspect: vi.fn().mockResolvedValue({ Running: false, ExitCode: 0 }),
  };

  const mockImage = {
    inspect: vi.fn().mockResolvedValue({}),
  };

  const docker = {
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    getImage: vi.fn().mockReturnValue(mockImage),
    pull: vi.fn(),
    ping: vi.fn().mockResolvedValue('OK'),
    listContainers: vi.fn().mockResolvedValue([]),
    modem: {
      demuxStream: vi.fn(),
      followProgress: vi.fn(),
    },
  };

  // Wire up exec mock
  mockContainer.exec.mockResolvedValue(mockExecInstance);

  // Mock exec.start to return a stream-like object
  const mockStream = { on: vi.fn(), pipe: vi.fn() };
  mockExecInstance.start.mockResolvedValue(mockStream);

  return { docker, mockContainer, mockExecInstance, mockStream, mockImage };
}

describe('ContainerService', () => {
  let service: ContainerService;
  let mocks: ReturnType<typeof createMockDocker>;

  beforeEach(() => {
    mocks = createMockDocker();
    service = new ContainerService(mocks.docker as any);
  });

  describe('createAndStart', () => {
    it('should create and start a container', async () => {
      const result = await service.createAndStart({
        sessionId: 'test-session',
        image: 'node:22',
        env: { NODE_ENV: 'test' },
        binds: ['/host/path:/container/path:rw'],
        memorySizeMb: 512,
        cpuCount: 1,
        labels: { 'custom.label': 'value' },
      });

      expect(result.containerId).toBe('container-123');
      expect(result.containerName).toBe('fleetwide-session-test-session');

      expect(mocks.docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'fleetwide-session-test-session',
          Image: 'node:22',
          WorkingDir: '/workspace',
          Labels: expect.objectContaining({
            'fleetwide.managed': 'true',
            'fleetwide.session-id': 'test-session',
            'custom.label': 'value',
          }),
        }),
      );

      expect(mocks.mockContainer.start).toHaveBeenCalled();
    });

    it('should set resource limits on the container', async () => {
      await service.createAndStart({
        sessionId: 'test-session',
        image: 'node:22',
        env: {},
        binds: [],
        memorySizeMb: 1024,
        cpuCount: 2,
        labels: {},
      });

      expect(mocks.docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Memory: 1024 * 1024 * 1024,
            NanoCpus: 2_000_000_000,
          }),
        }),
      );
    });

    it('should pull image if not available locally', async () => {
      mocks.mockImage.inspect.mockRejectedValueOnce(new Error('not found'));
      const mockPullStream = {};
      mocks.docker.pull.mockResolvedValue(mockPullStream);
      mocks.docker.modem.followProgress.mockImplementation(
        (_stream: any, cb: (err: Error | null) => void) => cb(null),
      );

      await service.createAndStart({
        sessionId: 'test-session',
        image: 'node:22',
        env: {},
        binds: [],
        memorySizeMb: 512,
        cpuCount: 1,
        labels: {},
      });

      expect(mocks.docker.pull).toHaveBeenCalledWith('node:22');
    });
  });

  describe('exec', () => {
    it('should execute a command inside a container', async () => {
      // demuxStream needs to be called to push data
      mocks.docker.modem.demuxStream.mockImplementation(
        (_stream: any, stdout: any, _stderr: any) => {
          stdout.write(Buffer.from('v22.0.0\n'));
          stdout.end();
        },
      );

      const result = await service.exec('container-123', ['node', '--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('v22.0.0\n');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      expect(mocks.mockContainer.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          Cmd: ['node', '--version'],
          AttachStdout: true,
          AttachStderr: true,
          WorkingDir: '/workspace',
        }),
      );
    });

    it('should use custom working directory when specified', async () => {
      mocks.docker.modem.demuxStream.mockImplementation(() => {});

      await service.exec('container-123', ['ls'], { workingDir: '/workspace/my-repo' });

      expect(mocks.mockContainer.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          WorkingDir: '/workspace/my-repo',
        }),
      );
    });
  });

  describe('stop', () => {
    it('should stop a container', async () => {
      await service.stop('container-123');
      expect(mocks.mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
    });

    it('should not throw if container already stopped', async () => {
      mocks.mockContainer.stop.mockRejectedValueOnce({ statusCode: 304 });
      await expect(service.stop('container-123')).resolves.toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove a container', async () => {
      await service.remove('container-123');
      expect(mocks.mockContainer.remove).toHaveBeenCalledWith({ force: true });
    });

    it('should not throw if container not found', async () => {
      mocks.mockContainer.remove.mockRejectedValueOnce({ statusCode: 404 });
      await expect(service.remove('container-123')).resolves.toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('should return running for a running container', async () => {
      const status = await service.getStatus('container-123');
      expect(status).toBe('running');
    });

    it('should return stopped for a stopped container', async () => {
      mocks.mockContainer.inspect.mockResolvedValueOnce({
        Id: 'container-123',
        State: { Running: false },
      });
      const status = await service.getStatus('container-123');
      expect(status).toBe('stopped');
    });

    it('should return not_found for a missing container', async () => {
      mocks.mockContainer.inspect.mockRejectedValueOnce({ statusCode: 404 });
      const status = await service.getStatus('container-123');
      expect(status).toBe('not_found');
    });
  });

  describe('ping', () => {
    it('should return true when Docker is accessible', async () => {
      expect(await service.ping()).toBe(true);
    });

    it('should return false when Docker is not accessible', async () => {
      mocks.docker.ping.mockRejectedValueOnce(new Error('connect ENOENT'));
      expect(await service.ping()).toBe(false);
    });
  });

  describe('pruneOrphaned', () => {
    it('should prune all fleetwide-managed containers', async () => {
      mocks.docker.listContainers.mockResolvedValueOnce([
        { Id: 'orphan-1' },
        { Id: 'orphan-2' },
      ]);

      const pruned = await service.pruneOrphaned();
      expect(pruned).toBe(2);
    });

    it('should return 0 when no orphans exist', async () => {
      const pruned = await service.pruneOrphaned();
      expect(pruned).toBe(0);
    });
  });
});
