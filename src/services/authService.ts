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

const VS_CODE_SIGN_OUT_COMMAND = '_signOutOfAccount';

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
                  'Faca login com a conta GitHub do aluno para preparar o ambiente da aula.'
              }
            }
          );

      return session;
    } catch (error) {
      if (isUserCancelledError(error)) {
        throw new UserCancelledError('A autenticacao com o GitHub foi cancelada.');
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
        description: 'Nenhuma sessao GitHub foi registrada por esta extensao.'
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
            'A sessao GitHub nao esta acessivel para a extensao neste momento.'
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
    // Limpa apenas a preferencia desta extensao. So isso nao remove a conta do menu do VS Code.
    try {
      const opts: vscode.AuthenticationGetSessionOptions = {
        silent: true,
        clearSessionPreference: true
      };

      if (storedSession?.githubAccountId && storedSession.githubAccountLabel) {
        opts.account = {
          id: storedSession.githubAccountId,
          label: storedSession.githubAccountLabel
        };
      }

      await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER, GITHUB_AUTH_SCOPES, opts);
    } catch (error) {
      this.logger.warn('Nao foi possivel limpar preferencia de sessao GitHub.', error);
    }

    return {
      clearedSessionPreference: true,
      fullLogoutSupported: false,
      note: 'Credenciais Git e preferencias de sessao limpas.'
    };
  }

  /**
   * A API publica de autenticacao do VS Code permite limpar a preferencia da
   * extensao, mas nao expoe um metodo oficial para remover sessoes de contas.
   *
   * Para o cenario de laboratorio, usamos o mesmo comando interno acionado pelo
   * menu de contas do VS Code. Ele recebe o provider e o label da conta, mostra
   * a confirmacao nativa do VS Code e remove apenas as sessoes daquela conta.
   *
   * Como e um comando interno, mantemos fallback seguro e nunca apagamos arquivos
   * internos do VS Code diretamente.
   */
  public async signOutStoredGitHubAccount(
    storedSession?: PersistedSessionState
  ): Promise<AuthDisconnectResult> {
    await this.clearSessionPreference(storedSession);

    const accountLabel = storedSession?.githubAccountLabel;

    if (!accountLabel) {
      return {
        clearedSessionPreference: true,
        fullLogoutSupported: false,
        note:
          'Nenhuma conta GitHub registrada por esta extensao foi encontrada para remover do VS Code.'
      };
    }

    try {
      const commands = await vscode.commands.getCommands(false);

      if (!commands.includes(VS_CODE_SIGN_OUT_COMMAND)) {
        return {
          clearedSessionPreference: true,
          fullLogoutSupported: false,
          note:
            `O VS Code desta maquina nao disponibilizou o logout automatico. ` +
            `Remova a conta GitHub "${accountLabel}" pelo menu de contas do VS Code.`
        };
      }

      await vscode.commands.executeCommand(VS_CODE_SIGN_OUT_COMMAND, {
        providerId: GITHUB_AUTH_PROVIDER,
        accountLabel
      });

      const status = await this.getSessionStatus(storedSession);

      if (!status.isAvailable) {
        return {
          clearedSessionPreference: true,
          fullLogoutSupported: true,
          note: `A conta GitHub "${accountLabel}" foi removida da sessao do VS Code.`
        };
      }

      return {
        clearedSessionPreference: true,
        fullLogoutSupported: false,
        note:
          `O VS Code ainda informa que a conta GitHub "${accountLabel}" esta ativa. ` +
          'Se apareceu uma confirmacao de logout, confirme "Sair/Sign Out"; caso contrario, remova pelo menu de contas.'
      };
    } catch (error) {
      this.logger.warn('Nao foi possivel acionar o logout da conta GitHub pelo VS Code.', error);
      return {
        clearedSessionPreference: true,
        fullLogoutSupported: false,
        note:
          `Nao foi possivel remover automaticamente a conta GitHub "${accountLabel}" do VS Code. ` +
          'Use o menu de contas no canto inferior esquerdo para sair manualmente.'
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
