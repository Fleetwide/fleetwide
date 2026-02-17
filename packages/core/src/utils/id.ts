/**
 * ID generation utilities.
 *
 * Uses cuid2 for collision-resistant, URL-safe identifiers.
 */

import { createId, isCuid } from '@paralleldrive/cuid2';

/** Generate a new unique ID */
export function generateId(): string {
  return createId();
}

/** Validate that a string is a valid cuid2 ID */
export function isValidId(id: string): boolean {
  return isCuid(id);
}

/** Generate an ID with a prefix (e.g., 'fw_abc123') */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${createId()}`;
}

/** Generate an API key with the 'fw_' prefix */
export function generateApiKey(): string {
  return generatePrefixedId('fw');
}
