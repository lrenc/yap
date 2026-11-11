import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { isWindows } from '../utils/env.ts';
import type { Issue } from './types.ts';

export function getBashPath(): string {
  return existsSync('/bin/bash') ? '/bin/bash' : 'bash';
}

export function getTaskkillPath(): string {
  return join(
    process.env.SystemRoot ?? 'C:\\windows', 'System32', 'taskkill.exe',
  );
}

export async function checkDeps(
  directory = process.cwd(),
): Promise<Issue[]> {
  const programs: Issue['program'][] = ['fd', 'rg', 'bash'];
  if (isWindows()) {
    programs.push('taskkill');
  }
  const results = await Promise.all(
    programs.map(program => checkProgram(program, directory)),
  );
  return results.filter(issue => issue !== undefined);
}

function checkProgram(
  program: Issue['program'], directory: string
): Promise<Issue | undefined> {
  let executable: string = program;
  if (program === 'bash') {
    executable = getBashPath();
  } else if (program === 'taskkill') {
    executable = getTaskkillPath();
  }
  const args = program === 'taskkill' ? ['/?'] : ['--version'];
  // Bash 会在工具的工作目录下解析 PATH 中的相对路径
  const cwd = program === 'bash' ? directory : process.cwd();

  return new Promise(finish => {
    const child = execFile(executable, args, {
      cwd,
      timeout: 2_000,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024,
      windowsHide: true,
    }, error => {
      if (!error) {
        finish(undefined);
        return;
      }
      let reason: Issue['reason'] = 'unavailable';
      if (error.code === 'ENOENT' && !hasProgramFile(executable, cwd)) {
        reason = 'missing';
      } else if (
        error.killed && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      ) {
        reason = 'timeout';
      }
      finish({ program, reason });
    });
    child.stdin?.end();
  });
}

function hasProgramFile(executable: string, directory: string): boolean {
  const paths = dirname(executable) === '.'
    ? (process.env.PATH ?? '').split(delimiter)
    : [''];
  const names = process.platform === 'win32'
    ? [executable, `${executable}.exe`, `${executable}.com`]
    : [executable];
  return paths.some(path => names.some(name => (
    existsSync(resolve(directory, path, name))
  )));
}