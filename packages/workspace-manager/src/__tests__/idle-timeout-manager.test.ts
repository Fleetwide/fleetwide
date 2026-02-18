import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleTimeoutManager } from '../idle-timeout-manager.js';

describe('IdleTimeoutManager', () => {
  let mockOrchestrator: {
    getExpiredPreviewSessions: ReturnType<typeof vi.fn>;
    destroyContainer: ReturnType<typeof vi.fn>;
  };
  let manager: IdleTimeoutManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockOrchestrator = {
      getExpiredPreviewSessions: vi.fn().mockResolvedValue([]),
      destroyContainer: vi.fn().mockResolvedValue(undefined),
    };
    manager = new IdleTimeoutManager(mockOrchestrator as any, 1000);
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('should check for expired sessions on interval', async () => {
    mockOrchestrator.getExpiredPreviewSessions.mockResolvedValue([
      { id: 'session-1' },
      { id: 'session-2' },
    ]);

    manager.start();

    // Advance past one interval
    await vi.advanceTimersByTimeAsync(1100);

    expect(mockOrchestrator.getExpiredPreviewSessions).toHaveBeenCalled();
    expect(mockOrchestrator.destroyContainer).toHaveBeenCalledWith('session-1', 'timeout');
    expect(mockOrchestrator.destroyContainer).toHaveBeenCalledWith('session-2', 'timeout');
  });

  it('should return count of expired sessions', async () => {
    mockOrchestrator.getExpiredPreviewSessions.mockResolvedValue([
      { id: 'session-1' },
    ]);

    const count = await manager.checkExpiredSessions();
    expect(count).toBe(1);
  });

  it('should handle errors gracefully during destroy', async () => {
    mockOrchestrator.getExpiredPreviewSessions.mockResolvedValue([
      { id: 'session-1' },
    ]);
    mockOrchestrator.destroyContainer.mockRejectedValueOnce(new Error('Docker error'));

    // Should not throw
    const count = await manager.checkExpiredSessions();
    expect(count).toBe(1);
  });

  it('should stop checking when stopped', async () => {
    manager.start();
    manager.stop();

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockOrchestrator.getExpiredPreviewSessions).not.toHaveBeenCalled();
  });
});
