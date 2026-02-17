import { describe, it, expect } from 'vitest';
import {
  validate,
  paginationSchema,
  registerRepoSchema,
  createScheduleSchema,
  cronExpressionSchema,
  runAgentSchema,
  createApiKeySchema,
} from '../utils/validation.js';

describe('Validation schemas', () => {
  describe('paginationSchema', () => {
    it('should accept valid pagination', () => {
      const result = validate(paginationSchema, { page: 1, limit: 20 });
      expect(result.success).toBe(true);
    });

    it('should use defaults', () => {
      const result = validate(paginationSchema, {});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should reject invalid limit', () => {
      const result = validate(paginationSchema, { limit: 200 });
      expect(result.success).toBe(false);
    });
  });

  describe('registerRepoSchema', () => {
    it('should accept valid repo with path', () => {
      const result = validate(registerRepoSchema, {
        name: 'my-repo',
        path: '/home/user/repos/my-repo',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid repo with remote URL', () => {
      const result = validate(registerRepoSchema, {
        name: 'my-repo',
        remoteUrl: 'https://github.com/user/repo.git',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid repo with SSH URL', () => {
      const result = validate(registerRepoSchema, {
        name: 'my-repo',
        remoteUrl: 'git@github.com:user/repo.git',
      });
      expect(result.success).toBe(true);
    });

    it('should reject repo without path or URL', () => {
      const result = validate(registerRepoSchema, { name: 'my-repo' });
      expect(result.success).toBe(false);
    });

    it('should reject repo without name', () => {
      const result = validate(registerRepoSchema, {
        path: '/home/user/repos/my-repo',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cronExpressionSchema', () => {
    it('should accept valid cron expressions', () => {
      expect(validate(cronExpressionSchema, '0 9 * * MON-FRI').success).toBe(true);
      expect(validate(cronExpressionSchema, '*/5 * * * *').success).toBe(true);
      expect(validate(cronExpressionSchema, '0 0 1 * *').success).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      expect(validate(cronExpressionSchema, 'invalid').success).toBe(false);
      expect(validate(cronExpressionSchema, '').success).toBe(false);
    });
  });

  describe('createScheduleSchema', () => {
    it('should accept valid schedule', () => {
      const result = validate(createScheduleSchema, {
        name: 'Daily review',
        cronExpression: '0 9 * * MON-FRI',
        timezone: 'Europe/Amsterdam',
        repositoryIds: 'all',
        prompt: 'Review the code for issues',
      });
      expect(result.success).toBe(true);
    });

    it('should accept schedule with specific repos', () => {
      const result = validate(createScheduleSchema, {
        name: 'Nightly check',
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
        repositoryIds: ['repo1', 'repo2'],
        prompt: 'Check for security issues',
      });
      expect(result.success).toBe(true);
    });

    it('should reject schedule without prompt', () => {
      const result = validate(createScheduleSchema, {
        name: 'Bad schedule',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        repositoryIds: 'all',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('runAgentSchema', () => {
    it('should accept valid agent run', () => {
      const result = validate(runAgentSchema, {
        prompt: 'Fix the bug in auth.ts',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty prompt', () => {
      const result = validate(runAgentSchema, { prompt: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('createApiKeySchema', () => {
    it('should accept valid API key creation', () => {
      const result = validate(createApiKeySchema, {
        name: 'CI key',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = validate(createApiKeySchema, { name: '' });
      expect(result.success).toBe(false);
    });
  });
});
