import { execFile, ExecFileException, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  GIT_COMMAND_TIMEOUT_MS,
  GIT_CONFIG_KEYS
} from '../constants';
import { GitCommandResult, IdentityState, StudentIdentity } from '../types';
import { LoggerService } from './loggerService';

const execFileAsync = promisify(execFile);

class GitCommandError extends Error {
  public constructor(
    message: string,
    public readonly args: string[],
    public readonly cwd: string | undefined,
    public readonly exitCode: number,
    public readonly stderr: string
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

export class GitService {
  private gitVersionPromise?: Promise<string | undefined>;

  public constructor(private readonly logger: LoggerService) {}

  public async isGitAvailable(): Promise<boolean> {
    return (await this.getGitVersion()) !== undefined;
  }

  public async getGitVersion(): Promise<string | undefined> {
    if (!this.gitVersionPromise) {
      this.gitVersionPromise = this.readGitVersion();
    }

    return this.gitVersionPromise;
  }

  public async getGlobalIdentity(): Promise<IdentityState> {
    const [name, email] = await Promise.all([
      this.getGlobalConfigValue(GIT_CONFIG_KEYS.userName),
      this.getGlobalConfigValue(GIT_CONFIG_KEYS.userEmail)
    ]);

    const identity: IdentityState = {};

    if (name) {
      identity.name = name;
    }

    if (email) {
      identity.email = email;
    }

    return identity;
  }

  public async setGlobalIdentity(identity: StudentIdentity): Promise<void> {
    const previousIdentity = await this.getGlobalIdentity();

    try {
      await this.setGlobalConfigValue(GIT_CONFIG_KEYS.userName, identity.name);
      await this.setGlobalConfigValue(GIT_CONFIG_KEYS.userEmail, identity.email);
    } catch (error) {
      this.logger.warn(
        'Falha ao aplicar identidade global. Tentando restaurar configuracao anterior.',
        error
      );
      await this.restoreGlobalIdentity(previousIdentity);
      throw error;
    }
  }

  public async clearGlobalIdentity(): Promise<void> {
    const results = await Promise.allSettled([
      this.unsetGlobalConfigValue(GIT_CONFIG_KEYS.userName),
      this.unsetGlobalConfigValue(GIT_CONFIG_KEYS.userEmail)
    ]);

    const firstRejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    if (firstRejected) {
      throw firstRejected.reason;
    }
  }

  /**
   * Rejeita (apaga) as credenciais HTTPS do GitHub do helper configurado no git.
   * Essencial em ambientes Windows Server compartilhados onde vários alunos usam
   * o mesmo Windows Credential Manager.
   */
  public async clearGitHubCredentials(username?: string): Promise<void> {
    const lines = ['protocol=https', 'host=github.com'];
    if (username) {
      lines.push(`username=${username}`);
    }
    const input = lines.join('\n') + '\n\n';

    try {
      await this.executeGitWithStdin(['credential', 'reject'], input);
      this.logger.info('Credenciais HTTPS do GitHub removidas do armazenamento local.');
    } catch (error) {
      this.logger.warn('Nao foi possivel remover credenciais HTTPS do GitHub.', error);
    }
  }

  public async getGlobalConfigValue(key: string): Promise<string | undefined> {
    const result = await this.executeGit(
      ['config', '--global', '--get', key],
      undefined,
      [0, 1]
    );

    const value = result.stdout.trim();
    return value.length > 0 ? value : undefined;
  }

  public async getGlobalConfigValues(key: string): Promise<string[]> {
    const result = await this.executeGit(
      ['config', '--global', '--get-all', key],
      undefined,
      [0, 1]
    );

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  public async setGlobalConfigValue(key: string, value: string): Promise<void> {
    await this.executeGit(['config', '--global', key, value]);
  }

  public async unsetGlobalConfigValue(key: string): Promise<void> {
    try {
      await this.executeGit(['config', '--global', '--unset-all', key], undefined, [0, 1, 5]);
    } catch (error) {
      if (this.isMissingConfigError(error)) {
        return;
      }

      throw error;
    }
  }

  private async restoreGlobalIdentity(previousIdentity: IdentityState): Promise<void> {
    if (previousIdentity.name) {
      await this.setGlobalConfigValue(GIT_CONFIG_KEYS.userName, previousIdentity.name);
    } else {
      await this.unsetGlobalConfigValue(GIT_CONFIG_KEYS.userName);
    }

    if (previousIdentity.email) {
      await this.setGlobalConfigValue(GIT_CONFIG_KEYS.userEmail, previousIdentity.email);
    } else {
      await this.unsetGlobalConfigValue(GIT_CONFIG_KEYS.userEmail);
    }
  }

  private async readGitVersion(): Promise<string | undefined> {
    try {
      const result = await this.executeGit(['--version']);
      return result.stdout.trim();
    } catch (error) {
      this.logger.warn('Git nao encontrado ou nao acessivel pelo PATH.', error);
      return undefined;
    }
  }

  private async executeGitWithStdin(args: string[], stdinContent: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('git', args, { windowsHide: true });

      let stderrOutput = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(
            new Error(`git ${args.join(' ')} saiu com codigo ${code}: ${stderrOutput.trim()}`)
          );
        }
      });

      child.on('error', reject);

      if (child.stdin) {
        child.stdin.write(stdinContent, 'utf8');
        child.stdin.end();
      } else {
        reject(new Error('stdin nao disponivel para o processo git credential'));
      }
    });
  }

  private async executeGit(
    args: string[],
    cwd?: string,
    acceptedExitCodes: number[] = [0]
  ): Promise<GitCommandResult> {
    try {
      const result = await execFileAsync('git', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: GIT_COMMAND_TIMEOUT_MS,
        windowsHide: true
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0
      };
    } catch (error) {
      const execError = error as ExecFileException & { stdout?: string; stderr?: string };
      const exitCode = typeof execError.code === 'number' ? execError.code : -1;
      const stdout = typeof execError.stdout === 'string' ? execError.stdout : '';
      const stderr = typeof execError.stderr === 'string' ? execError.stderr : '';

      if (acceptedExitCodes.includes(exitCode)) {
        return { stdout, stderr, exitCode };
      }

      const message = stderr.trim().length > 0 ? stderr.trim() : execError.message;
      const gitError = new GitCommandError(message, args, cwd, exitCode, stderr);
      this.logger.error('Falha ao executar comando Git.', {
        args,
        cwd,
        exitCode,
        stderr
      });
      throw gitError;
    }
  }

  private isMissingConfigError(error: unknown): boolean {
    if (!(error instanceof GitCommandError)) {
      return false;
    }

    const message = `${error.message}\n${error.stderr}`.toLowerCase();
    return message.includes('no such section or key') || error.exitCode === 5;
  }
}
