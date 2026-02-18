import type { Database } from '@fleetwide/database';
import { UnitOfWork } from '../../ports/uow/UnitOfWork';

export class DrizzleUnitOfWork extends UnitOfWork {
  constructor(private db: Database) {
    super();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(async () => {
      return fn();
    });
  }
}
