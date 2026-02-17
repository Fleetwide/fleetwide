import { describe, it, expect } from 'vitest';
import {
  FleetwideError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  AgentError,
  ProviderError,
  RateLimitError,
  ConfigurationError,
  isFleetwideError,
} from '../utils/errors.js';

describe('Error classes', () => {
  it('should create a base FleetwideError', () => {
    const error = new FleetwideError('test', 'TEST_ERROR', 500);
    expect(error.message).toBe('test');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.status).toBe(500);
    expect(error.name).toBe('FleetwideError');
  });

  it('should serialize to JSON correctly', () => {
    const error = new FleetwideError('test', 'TEST_ERROR', 500, { key: 'value' });
    const json = error.toJSON();
    expect(json.error.code).toBe('TEST_ERROR');
    expect(json.error.message).toBe('test');
    expect(json.error.details).toEqual({ key: 'value' });
    expect(json.status).toBe(500);
    expect(typeof json.timestamp).toBe('number');
  });

  it('should create NotFoundError with resource and ID', () => {
    const error = new NotFoundError('Repository', '123');
    expect(error.message).toBe("Repository with ID '123' not found");
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('should create NotFoundError without ID', () => {
    const error = new NotFoundError('Repository');
    expect(error.message).toBe('Repository not found');
  });

  it('should create ValidationError', () => {
    const error = new ValidationError('Invalid input', { field: 'name' });
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual({ field: 'name' });
  });

  it('should create AuthenticationError', () => {
    const error = new AuthenticationError();
    expect(error.status).toBe(401);
    expect(error.message).toBe('Authentication required');
  });

  it('should create AuthorizationError', () => {
    const error = new AuthorizationError();
    expect(error.status).toBe(403);
  });

  it('should create ConflictError', () => {
    const error = new ConflictError('Already exists');
    expect(error.status).toBe(409);
  });

  it('should create AgentError', () => {
    const error = new AgentError('Agent crashed');
    expect(error.status).toBe(500);
    expect(error.code).toBe('AGENT_ERROR');
  });

  it('should create ProviderError with provider name', () => {
    const error = new ProviderError('claude', 'Rate limited');
    expect(error.message).toBe("Provider 'claude': Rate limited");
    expect(error.status).toBe(502);
  });

  it('should create RateLimitError', () => {
    const error = new RateLimitError();
    expect(error.status).toBe(429);
  });

  it('should create ConfigurationError', () => {
    const error = new ConfigurationError('Missing API key');
    expect(error.status).toBe(500);
    expect(error.code).toBe('CONFIGURATION_ERROR');
  });

  it('should detect FleetwideError instances', () => {
    expect(isFleetwideError(new NotFoundError('test'))).toBe(true);
    expect(isFleetwideError(new ValidationError('test'))).toBe(true);
    expect(isFleetwideError(new Error('test'))).toBe(false);
    expect(isFleetwideError('not an error')).toBe(false);
  });
});
