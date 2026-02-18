import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VolumeService } from '../volume.service.js';

function createMockDocker() {
  const mockVolume = {
    inspect: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  const docker = {
    getVolume: vi.fn().mockReturnValue(mockVolume),
    createVolume: vi.fn().mockResolvedValue(mockVolume),
    listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
  };

  return { docker, mockVolume };
}

describe('VolumeService', () => {
  let service: VolumeService;
  let mocks: ReturnType<typeof createMockDocker>;

  beforeEach(() => {
    mocks = createMockDocker();
    service = new VolumeService(mocks.docker as any);
  });

  describe('ensureVolume', () => {
    it('should not create volume if it already exists', async () => {
      await service.ensureVolume('test-volume');
      expect(mocks.docker.createVolume).not.toHaveBeenCalled();
    });

    it('should create volume if it does not exist', async () => {
      mocks.mockVolume.inspect.mockRejectedValueOnce(new Error('not found'));
      await service.ensureVolume('test-volume');
      expect(mocks.docker.createVolume).toHaveBeenCalledWith({
        Name: 'test-volume',
        Labels: { 'fleetwide.managed': 'true' },
      });
    });
  });

  describe('getBindMounts', () => {
    it('should generate bind mounts for repos and dep cache', () => {
      const binds = service.getBindMounts({
        workspaceId: 'ws-1',
        repos: [
          { id: 'r1', name: 'repo-a', hostPath: '/repos/org/repo-a' },
          { id: 'r2', name: 'repo-b', hostPath: '/repos/org/repo-b' },
        ],
      });

      expect(binds).toEqual([
        '/repos/org/repo-a:/workspace/repo-a:rw',
        '/repos/org/repo-b:/workspace/repo-b:rw',
        'fleetwide-deps-ws-1:/root/.cache:rw',
      ]);
    });

    it('should include dep cache even with no repos', () => {
      const binds = service.getBindMounts({
        workspaceId: 'ws-1',
        repos: [],
      });

      expect(binds).toEqual(['fleetwide-deps-ws-1:/root/.cache:rw']);
    });
  });

  describe('removeWorkspaceVolumes', () => {
    it('should remove the workspace dep volume', async () => {
      await service.removeWorkspaceVolumes('ws-1');
      expect(mocks.docker.getVolume).toHaveBeenCalledWith('fleetwide-deps-ws-1');
      expect(mocks.mockVolume.remove).toHaveBeenCalled();
    });

    it('should not throw if volume does not exist', async () => {
      mocks.mockVolume.remove.mockRejectedValueOnce({ statusCode: 404 });
      await expect(service.removeWorkspaceVolumes('ws-1')).resolves.toBeUndefined();
    });
  });

  describe('listManagedVolumes', () => {
    it('should list fleetwide-managed volumes', async () => {
      mocks.docker.listVolumes.mockResolvedValueOnce({
        Volumes: [{ Name: 'fleetwide-deps-ws-1' }, { Name: 'fleetwide-deps-ws-2' }],
      });

      const volumes = await service.listManagedVolumes();
      expect(volumes).toEqual([
        { name: 'fleetwide-deps-ws-1' },
        { name: 'fleetwide-deps-ws-2' },
      ]);
    });
  });

  describe('pruneUnused', () => {
    it('should remove unused volumes', async () => {
      mocks.docker.listVolumes.mockResolvedValueOnce({
        Volumes: [{ Name: 'vol-1' }, { Name: 'vol-2' }],
      });

      // First volume succeeds, second is in use
      const removeCount = { count: 0 };
      mocks.mockVolume.remove
        .mockImplementationOnce(() => {
          removeCount.count++;
          return Promise.resolve();
        })
        .mockImplementationOnce(() => {
          removeCount.count++;
          return Promise.resolve();
        });

      const pruned = await service.pruneUnused();
      expect(pruned).toBe(2);
    });
  });
});
