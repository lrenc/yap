import { describe, expect, test } from 'bun:test';
import {
  isObject,
  isPositiveInteger,
  isSafeInteger,
} from '../../src/utils/guards.ts';
import { isLinux, isMacOS, isWindows } from '../../src/utils/env.ts';

describe('isObject', () => {
  test('accepts non-null, non-array objects', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ value: 1 })).toBe(true);
  });

  test('rejects null, arrays, and primitive values', () => {
    expect(isObject(null)).toBe(false);
    expect(isObject([])).toBe(false);
    expect(isObject('value')).toBe(false);
    expect(isObject(1)).toBe(false);
    expect(isObject(undefined)).toBe(false);
  });
});

describe('isSafeInteger', () => {
  test('accepts safe integers, including zero and negative values', () => {
    expect(isSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isSafeInteger(Number.MIN_SAFE_INTEGER)).toBe(true);
    expect(isSafeInteger(0)).toBe(true);
    expect(isSafeInteger(-1)).toBe(true);
  });

  test('rejects non-integers and unsafe numeric values', () => {
    expect(isSafeInteger(1.5)).toBe(false);
    expect(isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isSafeInteger(Number.NaN)).toBe(false);
    expect(isSafeInteger(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isSafeInteger('1')).toBe(false);
  });
});

describe('isPositiveInteger', () => {
  test('accepts only positive safe integers', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(-1)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
  });
});

describe('isWindows', () => {
  test('reflects the current platform', () => {
    expect(isWindows()).toBe(process.platform === 'win32');
  });
});

describe('isMacOS', () => {
  test('reflects the current platform', () => {
    expect(isMacOS()).toBe(process.platform === 'darwin');
  });
});

describe('isLinux', () => {
  test('reflects the current platform', () => {
    expect(isLinux()).toBe(process.platform === 'linux');
  });
});
