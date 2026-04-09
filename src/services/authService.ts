import * as vscode from 'vscode';
import {
  GITHUB_AUTH_PROVIDER,
  GITHUB_AUTH_SCOPES
} from '../constants';
import {
  AuthDisconnectResult,
  AuthSignInOptions,
  GitHubSessionStatus,
  PersistedSessionState
} from '../types';
import { isUserCancelledError, UserCancelledError } from '../utils/errors';
import { LoggerService } from './loggerService';

export class AuthService {
  public constructor(private readonly logger: LoggerService) {}

  public async signIn(options: AuthSignInOptions = {}): Promise<vscode.AuthenticationSession> {
    try {
      const session = options.forceNewSession
        ? await vscode.authentication.getSession(
            GITHUB_AUTH_PROVIDER,
            GITHUB_AUTH_SCOPES,
            {
              forceNewSession: {
                detail:
                  options.detail ??
                  'Selecione ou autentique a conta GitHub do aluno para esta aula.'
              }
            }
          )
        : await vscode.authentication.getSession(
            GITHUB_AUTH_PROVIDER,
            GITHUB_AUTH_SCOPES,
            {
              createIfNone: {
                detail:
                  options.detail ??
                  'Faça login com a conta GitHub do aluno para preparar o ambiente da aula.'
              }
            }
          );

      return session;
    } catch (error) {
      if (isUserCancelledError(error)) {
        throw new UserCancelledError('A autenticação com o GitHub foi cancelada.');
      }

      throw new Error(this.toFriendlyAuthError(error));
    }
  }

  public async getSessionStatus(
    storedSession?: PersistedSessionState
  ): Promise<GitHubSessionStatus> {
    if (!storedSession?.githubAccountId || !storedSession.githubAccountLabel) {
      return {
        isAvailable: false,
        description: 'Nenhuma sessão GitHub foi registrada por esta extensão.'
      };
    }

    try {
      const session = await vscode.authentication.getSession(
        GITHUB_AUTH_PROVIDER,
        GITHUB_AUTH_SCOPES,
        {
          silent: true,
          account: {
            id: storedSession.githubAccountId,
            label: storedSession.githubAccountLabel
          }
        }
      );

      if (!session) {
        return {
          isAvailable: false,
          accountLabel: storedSession.githubAccountLabel,
          description:
            'A sessão GitHub nao esta acessivel para a extensao neste momento.'
        };
      }

      return {
        isAvailable: true,
        accountLabel: session.account.label,
        description: `Conectado como ${session.account.label}.`
      };
    } catch (error) {
      this.logger.warn('Nao foi possivel verificar a sessao GitHub.', error);
      return {
        isAvailable: false,
        accountLabel: storedSession.githubAccountLabel,
        description:
          'Nao foi possivel confirmar a sessao GitHub pela API do VS Code.'
      };
    }
  }

  public async clearSessionPreference(
    storedSession?: PersistedSessionState
  ): Promise<AuthDisconnectResult> {
    const account =
      storedSession?.githubAccountId && storedSession.githubAccountLabel
        ? {
            id: storedSession.githubAccountId,
            label: storedSession.githubAccountLabel
          }
        : undefined;

    try {
      const getSessionOptions: vscode.AuthenticationGetSessionOptions = {
        silent: true,
        clearSessionPreference: true
      };

      if (account) {
        getSessionOptions.account = account;
      }

      await vscode.authentication.getSession(
        GITHUB_AUTH_PROVIDER,
        GITHUB_AUTH_SCOPES,
        getSessionOptions
      );

      return {
        clearedSessionPreference: true,
        fullLogoutSupported: false,
        note:
          'A preferencia de sessao desta extensao foi limpa. O logout completo do provider GitHub nao e exposto pela API publica do VS Code.'
      };
    } catch (error) {
      this.logger.warn('Nao foi possivel limpar a preferencia de sessao.', error);
      return {
        clearedSessionPreference: false,
        fullLogoutSupported: false,
        note:
          'A API publica do VS Code nao permite logout completo do provider GitHub para extensoes consumidoras.'
      };
    }
  }

  private toFriendlyAuthError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    if (
      normalized.includes('no authentication provider') ||
      normalized.includes('not registered')
    ) {
      return 'O provider de autenticacao GitHub do VS Code nao esta disponivel. Verifique se a extensao interna GitHub Authentication esta habilitada.';
    }

    return 'Nao foi possivel autenticar com o GitHub pelo fluxo oficial do VS Code.';
  }
}
