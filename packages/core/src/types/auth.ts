/**
 * Authentication and authorization types.
 *
 * v1 uses API Keys + JWT. The auth middleware is abstracted to allow
 * future OAuth/SAML providers to be plugged in.
 */

import type { ID, Timestamps } from './common.js';

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type Permission =
  | 'agents:read'
  | 'agents:write'
  | 'agents:run'
  | 'repos:read'
  | 'repos:write'
  | 'repos:sync'
  | 'schedules:read'
  | 'schedules:write'
  | 'integrations:read'
  | 'integrations:write'
  | 'fleet:read'
  | 'fleet:write'
  | 'fleet:approve'
  | 'audit:read'
  | 'admin';

export const ALL_PERMISSIONS: Permission[] = [
  'agents:read',
  'agents:write',
  'agents:run',
  'repos:read',
  'repos:write',
  'repos:sync',
  'schedules:read',
  'schedules:write',
  'integrations:read',
  'integrations:write',
  'fleet:read',
  'fleet:write',
  'fleet:approve',
  'audit:read',
  'admin',
];

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'member' | 'viewer';

export interface User extends Timestamps {
  id: ID;
  username: string;
  email?: string;
  role: UserRole;
  permissions: Permission[];
  lastLoginAt?: Date;
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: ID;
  name: string;
  /** SHA-256 hash — plaintext is never stored */
  keyHash: string;
  /** First 8 chars for identification (e.g., "fw_abc12345...") */
  keyPrefix: string;
  permissions: Permission[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}

/** Returned only on creation — includes the plaintext key */
export interface ApiKeyWithSecret extends ApiKey {
  /** The full plaintext API key — shown once, never again */
  secret: string;
}

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

export interface JwtPayload {
  sub: string; // User ID
  username: string;
  role: UserRole;
  permissions: Permission[];
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// Auth context (attached to requests)
// ---------------------------------------------------------------------------

export type AuthMethod = 'api_key' | 'jwt';

export interface AuthContext {
  method: AuthMethod;
  userId?: ID;
  apiKeyId?: ID;
  username: string;
  role: UserRole;
  permissions: Permission[];
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditActorType = 'user' | 'system' | 'schedule' | 'integration';

export interface AuditLogEntry {
  id: ID;
  action: string;
  actorType: AuditActorType;
  actorId?: ID;
  resourceType?: string;
  resourceId?: ID;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
