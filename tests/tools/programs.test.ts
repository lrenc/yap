import { describe, expect, test } from 'bun:test';
import {
  checkDeps,
  getBashPath,
  getTaskkillPath,
} from '../../src/tools/programs.ts';

describe('program paths', () => {
  test('returns a bash executable', () => {
    expect(getBashPath()).toMatch(/bash$/);
  });

  test('constructs the Windows taskkill path', () => {
    expect(getTaskkillPath()).toMatch(/taskkill\.exe$/);
  });
});

describe('checkDeps', () => {
  test('returns structured dependency issues without duplicates', async () => {
    const issues = await checkDeps();
    const programs = issues.map(issue => issue.program);

    expect(new Set(programs).size).toBe(programs.length);
    for (const issue of issues) {
      expect(['fd', 'rg', 'bash', 'taskkill']).toContain(issue.program);
      expect(['missing', 'unavailable', 'timeout']).toContain(issue.reason);
    }
  });
});
