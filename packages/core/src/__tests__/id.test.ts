import { describe, it, expect } from 'vitest';
import { generateId, isValidId, generatePrefixedId, generateApiKey } from '../utils/id.js';

describe('ID utilities', () => {
  it('should generate a unique ID', () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should generate unique IDs each time', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('should validate a valid cuid2 ID', () => {
    const id = generateId();
    expect(isValidId(id)).toBe(true);
  });

  it('should reject invalid IDs', () => {
    expect(isValidId('')).toBe(false);
    expect(isValidId('not-a-cuid')).toBe(false);
  });

  it('should generate prefixed IDs', () => {
    const id = generatePrefixedId('test');
    expect(id).toMatch(/^test_/);
  });

  it('should generate API keys with fw_ prefix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^fw_/);
  });
});
