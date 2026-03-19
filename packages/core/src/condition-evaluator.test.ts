import { describe, it, expect } from 'vitest';
import { evaluateCondition } from './condition-evaluator.js';

describe('evaluateCondition', () => {
  const ctx = { status: 'ok', count: 5, name: 'alice', tags: ['a', 'b'], score: 3.14 };

  describe('equality', () => {
    it('returns true when field equals value', () => {
      expect(evaluateCondition('status == ok', ctx)).toBe(true);
    });

    it('returns false when field does not equal value', () => {
      expect(evaluateCondition('status == fail', ctx)).toBe(false);
    });

    it('supports != operator', () => {
      expect(evaluateCondition('status != fail', ctx)).toBe(true);
      expect(evaluateCondition('status != ok', ctx)).toBe(false);
    });
  });

  describe('numeric comparison', () => {
    it('supports > operator', () => {
      expect(evaluateCondition('count > 3', ctx)).toBe(true);
      expect(evaluateCondition('count > 10', ctx)).toBe(false);
    });

    it('supports >= operator', () => {
      expect(evaluateCondition('count >= 5', ctx)).toBe(true);
      expect(evaluateCondition('count >= 6', ctx)).toBe(false);
    });

    it('supports < operator', () => {
      expect(evaluateCondition('count < 10', ctx)).toBe(true);
      expect(evaluateCondition('count < 3', ctx)).toBe(false);
    });

    it('supports <= operator', () => {
      expect(evaluateCondition('count <= 5', ctx)).toBe(true);
      expect(evaluateCondition('count <= 4', ctx)).toBe(false);
    });

    it('works with float values', () => {
      expect(evaluateCondition('score > 3.0', ctx)).toBe(true);
      expect(evaluateCondition('score < 3.0', ctx)).toBe(false);
    });
  });

  describe('contains', () => {
    it('returns true when array contains value', () => {
      expect(evaluateCondition('tags contains a', ctx)).toBe(true);
    });

    it('returns false when array does not contain value', () => {
      expect(evaluateCondition('tags contains c', ctx)).toBe(false);
    });

    it('returns true when string contains substring', () => {
      expect(evaluateCondition('name contains lic', ctx)).toBe(true);
      expect(evaluateCondition('name contains xyz', ctx)).toBe(false);
    });
  });

  describe('regex match', () => {
    it('returns true when field matches regex', () => {
      expect(evaluateCondition('name matches ^al', ctx)).toBe(true);
      expect(evaluateCondition('name matches ^bo', ctx)).toBe(false);
    });

    it('supports complex patterns', () => {
      expect(evaluateCondition('status matches ^o.*k$', ctx)).toBe(true);
    });
  });

  describe('missing field', () => {
    it('returns false when field is not present in context', () => {
      expect(evaluateCondition('missing == value', ctx)).toBe(false);
    });
  });

  describe('malformed expression', () => {
    it('returns false for empty string', () => {
      expect(evaluateCondition('', ctx)).toBe(false);
    });

    it('returns false for unknown operator', () => {
      expect(evaluateCondition('count !! 5', ctx)).toBe(false);
    });
  });

  describe('boolean context values', () => {
    it('compares boolean true', () => {
      expect(evaluateCondition('ready == true', { ready: true })).toBe(true);
      expect(evaluateCondition('ready == true', { ready: false })).toBe(false);
    });

    it('compares boolean false', () => {
      expect(evaluateCondition('ready == false', { ready: false })).toBe(true);
    });
  });
});
