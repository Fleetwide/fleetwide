/**
 * Custom error classes with error codes.
 *
 * All errors include a machine-readable code and HTTP status for consistent
 * API error responses.
 */

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

export class FleetwideError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'FleetwideError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
      status: this.status,
      timestamp: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// Specific error classes
// ---------------------------------------------------------------------------

export class NotFoundError extends FleetwideError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends FleetwideError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends FleetwideError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends FleetwideError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class ConflictError extends FleetwideError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class AgentError extends FleetwideError {
  constructor(message: string, details?: unknown) {
    super(message, 'AGENT_ERROR', 500, details);
    this.name = 'AgentError';
  }
}

export class ProviderError extends FleetwideError {
  constructor(providerId: string, message: string, details?: unknown) {
    super(`Provider '${providerId}': ${message}`, 'PROVIDER_ERROR', 502, details);
    this.name = 'ProviderError';
  }
}

export class RateLimitError extends FleetwideError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

export class ConfigurationError extends FleetwideError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.name = 'ConfigurationError';
  }
}

// ---------------------------------------------------------------------------
// Error type guard
// ---------------------------------------------------------------------------

export function isFleetwideError(error: unknown): error is FleetwideError {
  return error instanceof FleetwideError;
}
