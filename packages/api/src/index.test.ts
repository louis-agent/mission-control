import { describe, it, expect } from 'vitest';
import { API_VERSION } from './index.js';

describe('api', () => {
  it('exports API_VERSION', () => {
    expect(API_VERSION).toBe('v1');
  });
});
