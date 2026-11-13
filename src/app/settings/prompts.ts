import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from '../../utils/write.ts';
import { ensureDirectory, repairPermissions } from './permissions.ts';
import { DEFAULT_PROMPT, promptNameSchema } from './schema.ts';

function validateContent(content: string, path: string): void {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`Prompt must not be empty: ${path}`);
  }
}

export class PromptRepository {
  readonly directoryPath: string;

  #warningMessages: string[] = [];
  #pending: Promise<unknown> = Promise.resolve();

  constructor(readonly rootDirectory = join(homedir(), '.yap')) {
    this.directoryPath = join(rootDirectory, 'prompts');
  }

  get warnings(): readonly string[] {
    return [...this.#warningMessages];
  }

  list(): Promise<string[]> {
    return this.#enqueue(async () => {
      await this.#checkDirectories();
      let entries;
      try {
        entries = await fs.readdir(this.directoryPath, {
          withFileTypes: true,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw new Error(
          `Cannot list Prompts: ${this.directoryPath}`
        );
      }
      const names: string[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) {
          continue;
        }
        const name = entry.name.slice(0, -3);
        if (!promptNameSchema.safeParse(name).success) {
          continue;
        }
        await this.#checkPermissions(this.#filePath(name), 0o600);
        names.push(name);
      }
      return names.sort();
    });
  }

  read(name: string): Promise<string | undefined> {
    return this.#enqueue(() => this.#readContent(name));
  }

  create(name: string, content: string): Promise<void> {
    return this.#enqueue(() => (
      this.#write(name, content, false)
    ));
  }

  update(name: string, content: string): Promise<void> {
    return this.#enqueue(() => (
      this.#write(name, content, true)
    ));
  }

  delete(name: string): Promise<void> {
    return this.#enqueue(async () => {
      const path = this.#filePath(name);
      await this.#checkDirectories();
      if (!await this.#hasExactName(name)) {
        throw new Error(`Prompt not found: ${path}`);
      }
      await this.#checkPermissions(path, 0o600);
      try {
        await fs.unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Prompt not found: ${path}`);
        }
        throw new Error(`Cannot delete Prompt: ${path}`);
      }
    });
  }

  loadSelected(activePrompt: string | null): Promise<{
    content: string;
    missingPrompt: string | null;
  }> {
    return this.#enqueue(async () => {
      if (activePrompt === null) {
        return {
          content: DEFAULT_PROMPT,
          missingPrompt: null,
        };
      }
      const content = await this.#readContent(activePrompt);
      return content === undefined
        ? {
          content: DEFAULT_PROMPT,
          missingPrompt: activePrompt,
        }
        : {
          content,
          missingPrompt: null,
        };
    });
  }

  #filePath(name: string): string {
    if (!promptNameSchema.safeParse(name).success) {
      throw new Error('Invalid Prompt name');
    }
    return join(this.directoryPath, `${name}.md`);
  }

  async #readContent(name: string): Promise<string | undefined> {
    const path = this.#filePath(name);
    await this.#checkDirectories();
    if (!await this.#hasExactName(name)) {
      return undefined;
    }
    await this.#checkPermissions(path, 0o600);
    let content: string;
    try {
      content = await fs.readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw new Error(`Cannot read Prompt: ${path}`);
    }
    validateContent(content, path);
    return content;
  }

  async #write(
    name: string,
    content: string,
    mustExist: boolean,
  ): Promise<void> {
    const path = this.#filePath(name);
    validateContent(content, path);
    await this.#checkDirectories();
    let exists = false;
    try {
      const stat = await fs.lstat(path);
      if (!stat.isFile()) {
        throw new Error(
          `Prompt path must be a regular file: ${path}`
        );
      }
      exists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    if (exists !== mustExist) {
      throw new Error(
        `${exists ? 'Prompt already exists' : 'Prompt not found'}: ${path}`
      );
    }
    if (mustExist && !await this.#hasExactName(name)) {
      throw new Error(`Prompt not found: ${path}`);
    }
    try {
      await ensureDirectory(this.rootDirectory);
      await ensureDirectory(this.directoryPath);
      await writeFileAtomic(path, content, {
        mode: 0o600,
      });
    } catch {
      throw new Error(`Cannot save Prompt: ${path}`);
    }
  }

  async #checkDirectories(): Promise<void> {
    await this.#checkPermissions(this.rootDirectory, 0o700);
    await this.#checkPermissions(this.directoryPath, 0o700);
  }

  async #hasExactName(name: string): Promise<boolean> {
    try {
      return (await fs.readdir(this.directoryPath)).includes(`${name}.md`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw new Error(`Cannot list Prompts: ${this.directoryPath}`);
    }
  }

  async #checkPermissions(
    path: string,
    mode: 0o700 | 0o600,
  ): Promise<void> {
    const warning = await repairPermissions(path, mode);
    if (warning) {
      this.#warningMessages.push(warning);
    }
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(() => {
      this.#warningMessages = [];
      return operation();
    });
    this.#pending = result.catch(() => {});
    return result;
  }
}
