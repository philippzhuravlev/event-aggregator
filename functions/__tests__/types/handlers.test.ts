// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import {
  isTypedError,
  toTypedError,
  successResult,
  errorResult,
  getQueryParam,
  getQueryParamBoolean,
  getQueryParamNumber,
} from '../../types/handlers';

describe('handlers type utilities', () => {
  describe('isTypedError', () => {
    it('should return true for Error objects', () => {
      const error = new Error('Test error');
      expect(isTypedError(error)).toBe(true);
    });

    it('should return true for objects with message property', () => {
      const error = { message: 'Test', code: 500 };
      expect(isTypedError(error)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isTypedError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isTypedError(undefined)).toBe(false);
    });

    it('should return false for objects without message', () => {
      expect(isTypedError({ code: 500 })).toBe(false);
    });

    it('should return false for strings', () => {
      expect(isTypedError('error string')).toBe(false);
    });

    it('should return false for numbers', () => {
      expect(isTypedError(404)).toBe(false);
    });
  });

  describe('toTypedError', () => {
    it('should return TypedError as-is', () => {
      const error = { name: 'TestError', message: 'Test' };
      expect(toTypedError(error)).toBe(error);
    });

    it('should convert Error objects', () => {
      const error = new Error('Test error');
      const result = toTypedError(error);
      expect(result.message).toBe('Test error');
    });

    it('should convert string to TypedError', () => {
      const result = toTypedError('Error string');
      expect(result.name).toBe('Error');
      expect(result.message).toBe('Error string');
    });

    it('should convert unknown types to UnknownError', () => {
      const result = toTypedError(123);
      expect(result.name).toBe('UnknownError');
      expect(result.message).toBe('An unknown error occurred');
    });

    it('should handle null', () => {
      const result = toTypedError(null);
      expect(result.name).toBe('UnknownError');
      expect(result.message).toBe('An unknown error occurred');
    });

    it('should handle objects without message', () => {
      const result = toTypedError({ code: 404 });
      expect(result.name).toBe('UnknownError');
    });
  });

  describe('successResult', () => {
    it('should create success result with data', () => {
      const data = { id: '123', name: 'Test' };
      const result = successResult(data);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should handle null data', () => {
      const result = successResult(null);
      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
    });

    it('should handle array data', () => {
      const data = [1, 2, 3];
      const result = successResult(data);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });
  });

  describe('errorResult', () => {
    it('should create error result from Error', () => {
      const error = new Error('Failed');
      const result = errorResult(error);
      
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed');
    });

    it('should create error result from string', () => {
      const result = errorResult('Operation failed');
      
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Operation failed');
    });

    it('should handle unknown error types', () => {
      const result = errorResult(404);
      
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('An unknown error occurred');
    });
  });

  describe('getQueryParam', () => {
    it('should get string param', () => {
      const query = { name: 'test', age: '25' };
      expect(getQueryParam(query, 'name')).toBe('test');
    });

    it('should get first value from array', () => {
      const query = { tags: ['tag1', 'tag2'] };
      expect(getQueryParam(query, 'tags')).toBe('tag1');
    });

    it('should return undefined for missing param', () => {
      const query = { name: 'test' };
      expect(getQueryParam(query, 'missing')).toBeUndefined();
    });

    it('should return default value for missing param', () => {
      const query = { name: 'test' };
      expect(getQueryParam(query, 'missing', 'default')).toBe('default');
    });

    it('should return default value for empty string', () => {
      const query = { name: '' };
      expect(getQueryParam(query, 'name', 'default')).toBe('default');
    });

    it('should return default value for undefined param', () => {
      const query = { name: undefined };
      expect(getQueryParam(query, 'name', 'default')).toBe('default');
    });
  });

  describe('getQueryParamBoolean', () => {
    it('should parse "true" as boolean', () => {
      const query = { active: 'true' };
      expect(getQueryParamBoolean(query, 'active')).toBe(true);
    });

    it('should parse "TRUE" as boolean', () => {
      const query = { active: 'TRUE' };
      expect(getQueryParamBoolean(query, 'active')).toBe(true);
    });

    it('should parse "false" as boolean', () => {
      const query = { active: 'false' };
      expect(getQueryParamBoolean(query, 'active')).toBe(false);
    });

    it('should return false for non-boolean strings', () => {
      const query = { active: 'yes' };
      expect(getQueryParamBoolean(query, 'active')).toBe(false);
    });

    it('should return default value for missing param', () => {
      const query = {};
      expect(getQueryParamBoolean(query, 'active', true)).toBe(true);
    });

    it('should return false by default', () => {
      const query = {};
      expect(getQueryParamBoolean(query, 'active')).toBe(false);
    });
  });

  describe('getQueryParamNumber', () => {
    it('should parse number string', () => {
      const query = { count: '42' };
      expect(getQueryParamNumber(query, 'count')).toBe(42);
    });

    it('should parse negative numbers', () => {
      const query = { offset: '-10' };
      expect(getQueryParamNumber(query, 'offset')).toBe(-10);
    });

    it('should parse zero', () => {
      const query = { page: '0' };
      expect(getQueryParamNumber(query, 'page')).toBe(0);
    });

    it('should return undefined for missing param', () => {
      const query = {};
      expect(getQueryParamNumber(query, 'count')).toBeUndefined();
    });

    it('should return default value for missing param', () => {
      const query = {};
      expect(getQueryParamNumber(query, 'count', 10)).toBe(10);
    });

    it('should return default for non-number string', () => {
      const query = { count: 'abc' };
      expect(getQueryParamNumber(query, 'count', 5)).toBe(5);
    });

    it('should return default for NaN', () => {
      const query = { count: 'not-a-number' };
      expect(getQueryParamNumber(query, 'count', 0)).toBe(0);
    });
  });
});

