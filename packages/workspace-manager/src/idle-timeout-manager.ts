import { createLogger } from '@fleetwide/core';
import type { SessionOrchestrator } from './session-orchestrator.js';

const logger = createLogger({ name: 'idle-timeout-manager' });

export class IdleTimeoutManager {
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    private sessionOrchestrator: SessionOrchestrator,
    private checkIntervalMs: number = 60_000,
  ) {}

  start(): void {
    this.intervalId = setInterval(() => {
      this.checkExpiredSessions().catch((err) => {
        logger.error({ err }, 'Error checking expired sessions');
      });
    }, this.checkIntervalMs);

    logger.info({ checkIntervalMs: this.checkIntervalMs }, 'Idle timeout manager started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    logger.info('Idle timeout manager stopped');
  }

  async checkExpiredSessions(): Promise<number> {
    const expired = await this.sessionOrchestrator.getExpiredPreviewSessions();

    for (const session of expired) {
      try {
        await this.sessionOrchestrator.destroyContainer(session.id, 'timeout');
        logger.info({ sessionId: session.id }, 'Expired session container destroyed');
      } catch (err) {
        logger.error({ sessionId: session.id, err }, 'Failed to destroy expired session');
      }
    }

    return expired.length;
  }
}
