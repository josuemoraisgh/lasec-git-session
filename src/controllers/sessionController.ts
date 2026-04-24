import * as vscode from 'vscode';
import {
  COMMANDS,
  EXTENSION_NAME,
  GITHUB_AUTH_PROVIDER,
  GITHUB_AUTH_SCOPES
} from '../constants';
import {
  PersistedSessionState,
  SessionStatusSnapshot,
  StatusBarMode,
  StatusBarViewModel,
  StudentIdentity
} from '../types';
import { toErrorMessage, UserCancelledError } from '../utils/errors';
import {
  normalizeStudentIdentity,
  validateStudentEmail,
  validateStudentName
} from '../utils/validation';
import { AuthService } from '../services/authService';
import { CredentialCleanupService } from '../services/credentialCleanupService';
import { GitService } from '../services/gitService';
import { LoggerService } from '../services/loggerService';
import { SessionService } from '../services/sessionService';
import { StatusBarService } from '../services/statusBarService';

interface SessionControllerDependencies {
  authService: AuthService;
  credentialCleanupService: CredentialCleanupService;
  gitService: GitService;
  logger: LoggerService;
  sessionService: SessionService;
  statusBarService: StatusBarService;
}

export class SessionController {
  private isBusy = false;

  public constructor(private readonly services: SessionControllerDependencies) {}

  public async refreshStatus(): Promise<void> {
    if (this.isBusy) {
      return;
    }

    try {
      const snapshot = await this.buildStatusSnapshot();
      this.services.statusBarService.update(this.createViewModel(snapshot));
    } catch (error) {
      this.services.logger.error('Falha ao atualizar o status da extensao.', error);
      this.services.statusBarService.update({
        mode: 'error',
        text: `$(warning) ${EXTENSION_NAME}`,
        tooltip: `${EXTENSION_NAME} encontrou um erro ao atualizar o status.\n${toErrorMessage(
          error,
          'Erro desconhecido.'
        )}`
      });
    }
  }

  public async handleStatusBarClick(): Promise<void> {
    const snapshot = await this.buildStatusSnapshot();

    if (snapshot.viewMode === 'connected' || snapshot.globalIdentity.name || snapshot.globalIdentity.email) {
      const choice = await vscode.window.showQuickPick(
        [
          {
            label: '$(info) Ver status atual',
            description: 'Mostra o estado global do Git e da sessao GitHub.',
            command: COMMANDS.showStatus
          },
          {
            label: '$(person) Trocar aluno',
            description: 'Substitui a identidade global e inicia uma nova autenticacao.',
            command: COMMANDS.switchStudent
          },
          {
            label: '$(sign-out) Encerrar aula',
            description: 'Remove a identidade global e encerra o uso da extensao nesta maquina.',
            command: COMMANDS.endSession
          }
        ],
        {
          placeHolder: `Escolha uma acao para a sessao atual do ${EXTENSION_NAME}.`,
          ignoreFocusOut: true
        }
      );

      if (choice) {
        await vscode.commands.executeCommand(choice.command);
      }

      return;
    }

    await this.startSession();
  }

  public async startSession(): Promise<void> {
    await this.runExclusive('Preparando a configuracao global do Git para a aula...', async () => {
      await this.ensureGitReady();
      const storedSession = this.services.sessionService.getSession();
      const globalIdentity = await this.services.gitService.getGlobalIdentity();

      await this.confirmReplacementIfNeeded('start', globalIdentity, storedSession);

      const authSession = await this.services.authService.signIn({
        detail:
          'Faca login com a conta GitHub do aluno para preparar a configuracao global do Git nesta maquina.'
      });

      const initialIdentity = this.buildInitialIdentity(globalIdentity, storedSession);
      const identity = await this.promptForStudentIdentity(initialIdentity);

      await this.services.gitService.setGlobalIdentity(identity);

      const persistedSession = this.createPersistedSession(authSession, identity);
      await this.services.sessionService.saveSession(persistedSession);

      vscode.window.showInformationMessage(
        `${EXTENSION_NAME} ativo para ${identity.name}. Os commits nesta maquina agora usarao ${identity.email} via git config --global.`
      );
    });
  }

  public async switchStudent(): Promise<void> {
    await this.runExclusive('Trocando o aluno ativo na configuracao global do Git...', async () => {
      await this.ensureGitReady();
      const storedSession = this.services.sessionService.getSession();
      const globalIdentity = await this.services.gitService.getGlobalIdentity();

      await this.confirmReplacementIfNeeded('switch', globalIdentity, storedSession);

      if (storedSession?.githubAccountLabel) {
        await this.services.gitService.clearGitHubCredentials(storedSession.githubAccountLabel);
      }
      await this.services.authService.signOutStoredGitHubAccount(storedSession);

      const authSession = await this.services.authService.signIn({
        forceNewSession: true,
        detail:
          'Selecione ou autentique a conta GitHub do novo aluno para continuar a sessao global nesta maquina.'
      });

      const initialIdentity = this.buildInitialIdentity(globalIdentity, storedSession);
      const identity = await this.promptForStudentIdentity(initialIdentity);

      await this.services.gitService.setGlobalIdentity(identity);

      const persistedSession = this.createPersistedSession(authSession, identity);
      await this.services.sessionService.saveSession(persistedSession);

      vscode.window.showInformationMessage(
        `Aluno trocado com sucesso. A configuracao global do Git agora esta definida para ${identity.name}.`
      );
    });
  }

  public async endSession(): Promise<void> {
    await this.runExclusive('Encerrando a sessao global da aula nesta maquina...', async () => {
      await this.ensureGitReady();
      const storedSession = this.services.sessionService.getSession();
      const globalIdentity = await this.services.gitService.getGlobalIdentity();

      if (!globalIdentity.name && !globalIdentity.email && !storedSession) {
        vscode.window.showInformationMessage(
          `Nao ha sessao ativa do ${EXTENSION_NAME} nesta maquina.`
        );
        return;
      }

      const label = globalIdentity.name ?? storedSession?.studentName ?? 'o aluno atual';
      const confirmation = await vscode.window.showWarningMessage(
        `Deseja encerrar a sessao de ${label} e limpar a identidade global do Git nesta maquina?`,
        { modal: true },
        'Encerrar aula',
        'Cancelar'
      );

      if (confirmation !== 'Encerrar aula') {
        throw new UserCancelledError('O encerramento da aula foi cancelado.');
      }

      await this.services.gitService.clearGlobalIdentity();

      if (storedSession?.githubAccountLabel) {
        await this.services.gitService.clearGitHubCredentials(storedSession.githubAccountLabel);
      }

      const cleanupResult = await this.services.credentialCleanupService.cleanupGlobalCredentialResidues();
      const authDisconnectResult =
        await this.services.authService.signOutStoredGitHubAccount(storedSession);
      await this.services.sessionService.clearSession();

      const extrasMessage =
        cleanupResult.removed.length > 0
          ? ` Tambem removidas: ${cleanupResult.removed.map((item) => item.key).join(', ')}.`
          : '';

      const message =
        `A identidade global do Git e as credenciais foram removidas.${extrasMessage} ` +
        authDisconnectResult.note;

      if (authDisconnectResult.fullLogoutSupported || !storedSession?.githubAccountLabel) {
        vscode.window.showInformationMessage(message);
        return;
      }

      const action = await vscode.window.showWarningMessage(
        message,
        'Abrir contas do VS Code'
      );

      if (action === 'Abrir contas do VS Code') {
        await vscode.commands.executeCommand('workbench.action.manageAccounts');
      }
    });
  }

  public async showStatus(): Promise<void> {
    const snapshot = await this.buildStatusSnapshot();
    const message = this.buildStatusMessage(snapshot);

    if (snapshot.viewMode === 'error') {
      await vscode.window.showWarningMessage(message);
      return;
    }

    await vscode.window.showInformationMessage(message);
  }

  public handleAuthenticationSessionsChanged(
    event: vscode.AuthenticationSessionsChangeEvent
  ): void {
    if (event.provider.id !== GITHUB_AUTH_PROVIDER) {
      return;
    }

    void this.refreshStatus();
  }

  private async runExclusive(
    busyMessage: string,
    operation: () => Promise<void>
  ): Promise<void> {
    if (this.isBusy) {
      vscode.window.showInformationMessage(
        `${EXTENSION_NAME} ja esta executando outra operacao. Aguarde um instante.`
      );
      return;
    }

    this.isBusy = true;
    this.services.statusBarService.update({
      mode: 'busy',
      text: `$(sync~spin) ${EXTENSION_NAME}`,
      tooltip: busyMessage
    });

    try {
      await operation();
    } catch (error) {
      if (error instanceof UserCancelledError) {
        vscode.window.showInformationMessage(
          `${error.message} Nenhuma alteracao foi aplicada na configuracao global do Git.`
        );
      } else {
        this.services.logger.error(`Operacao do ${EXTENSION_NAME} falhou.`, error);
        const message = toErrorMessage(
          error,
          `Nao foi possivel concluir a operacao do ${EXTENSION_NAME}.`
        );
        this.services.statusBarService.update({
          mode: 'error',
          text: `$(warning) ${EXTENSION_NAME}`,
          tooltip: `${EXTENSION_NAME} encontrou um erro.\n${message}`
        });
        vscode.window.showErrorMessage(message);
      }
    } finally {
      this.isBusy = false;
      await this.refreshStatus();
    }
  }

  private async buildStatusSnapshot(): Promise<SessionStatusSnapshot> {
    const gitAvailable = await this.services.gitService.isGitAvailable();

    if (!gitAvailable) {
      return {
        gitAvailable: false,
        globalIdentity: {},
        viewMode: 'error',
        message: 'O Git nao foi encontrado no PATH. Instale o Git e reinicie o VS Code.'
      };
    }

    let storedSession = this.services.sessionService.getSession();
    const globalIdentity = await this.services.gitService.getGlobalIdentity();

    if (storedSession && !globalIdentity.name && !globalIdentity.email) {
      await this.services.sessionService.clearSession();
      storedSession = undefined;
    } else if (
      storedSession &&
      globalIdentity.name &&
      globalIdentity.email &&
      (storedSession.studentName !== globalIdentity.name ||
        storedSession.studentEmail !== globalIdentity.email)
    ) {
      storedSession = {
        ...storedSession,
        studentName: globalIdentity.name,
        studentEmail: globalIdentity.email
      };
      await this.services.sessionService.saveSession(storedSession);
    }

    const githubStatus = storedSession
      ? await this.services.authService.getSessionStatus(storedSession)
      : {
          isAvailable: false,
          description:
            globalIdentity.name || globalIdentity.email
              ? 'Identidade global configurada; autenticacao GitHub nao foi confirmada por esta extensao.'
              : 'Nenhuma sessao GitHub foi iniciada por esta extensao nesta maquina.'
        };

    const hasName = Boolean(globalIdentity.name);
    const hasEmail = Boolean(globalIdentity.email);

    let viewMode: StatusBarMode = 'disconnected';
    let message = 'Nenhum aluno esta ativo na configuracao global do Git.';

    if (hasName && hasEmail) {
      viewMode = 'connected';
      message = 'Configuracao global do Git pronta para o aluno atual.';
    } else if (hasName || hasEmail) {
      viewMode = 'error';
      message =
        'A configuracao global do Git esta incompleta nesta maquina. Use "Trocar aluno" ou "Encerrar aula" para corrigir.';
    }

    const snapshot: SessionStatusSnapshot = {
      gitAvailable: true,
      globalIdentity,
      githubStatus,
      viewMode,
      message
    };

    if (storedSession) {
      snapshot.storedSession = storedSession;
    }

    return snapshot;
  }

  private createViewModel(snapshot: SessionStatusSnapshot): StatusBarViewModel {
    switch (snapshot.viewMode) {
      case 'connected':
        return {
          mode: 'connected',
          text: `$(check) ${EXTENSION_NAME}`,
          tooltip: this.buildConnectedTooltip(snapshot),
          color: new vscode.ThemeColor('testing.iconPassed')
        };
      case 'error':
        return {
          mode: 'error',
          text: `$(warning) ${EXTENSION_NAME}`,
          tooltip: `${EXTENSION_NAME}\n${snapshot.message ?? 'Erro nao especificado.'}`,
          color: new vscode.ThemeColor('problemsWarningIcon.foreground')
        };
      case 'busy':
        return {
          mode: 'busy',
          text: `$(sync~spin) ${EXTENSION_NAME}`,
          tooltip: snapshot.message ?? 'Executando operacao...'
        };
      case 'disconnected':
      default:
        return {
          mode: 'disconnected',
          text: `$(circle-slash) ${EXTENSION_NAME}`,
          tooltip: `${EXTENSION_NAME}\n${snapshot.message ?? 'Clique para iniciar a sessao do aluno.'}`
        };
    }
  }

  private buildConnectedTooltip(snapshot: SessionStatusSnapshot): string {
    return [
      `${EXTENSION_NAME} ativo`,
      'Escopo Git: configuracao global (--global)',
      `Nome: ${snapshot.globalIdentity.name ?? snapshot.storedSession?.studentName ?? 'Nao informado'}`,
      `E-mail: ${snapshot.globalIdentity.email ?? snapshot.storedSession?.studentEmail ?? 'Nao informado'}`,
      `GitHub: ${snapshot.githubStatus?.description ?? 'Status nao disponivel.'}`,
      'Aplica-se aos novos commits nesta maquina ate encerrar.'
    ].join('\n');
  }

  private buildStatusMessage(snapshot: SessionStatusSnapshot): string {
    const name =
      snapshot.globalIdentity.name ?? snapshot.storedSession?.studentName ?? 'Nao configurado';
    const email =
      snapshot.globalIdentity.email ?? snapshot.storedSession?.studentEmail ?? 'Nao configurado';
    const github = snapshot.githubStatus?.description ?? 'Status GitHub indisponivel.';

    return `Escopo: global (--global) | Nome: ${name} | E-mail: ${email} | GitHub: ${github}`;
  }

  private async ensureGitReady(): Promise<void> {
    const gitAvailable = await this.services.gitService.isGitAvailable();

    if (!gitAvailable) {
      throw new Error(
        `O Git nao foi encontrado no PATH. Instale o Git e reinicie o VS Code para usar o ${EXTENSION_NAME}.`
      );
    }
  }

  private async confirmReplacementIfNeeded(
    mode: 'start' | 'switch',
    globalIdentity: Partial<StudentIdentity>,
    storedSession?: PersistedSessionState
  ): Promise<void> {
    const currentName = globalIdentity.name ?? storedSession?.studentName;
    const currentEmail = globalIdentity.email ?? storedSession?.studentEmail;

    if (!currentName && !currentEmail) {
      return;
    }

    const actionLabel = mode === 'switch' ? 'Trocar aluno' : 'Substituir identidade';
    const target = currentName
      ? `${currentName}${currentEmail ? ` <${currentEmail}>` : ''}`
      : currentEmail;

    const message =
      mode === 'switch'
        ? `A configuracao global do Git ja esta definida para ${target}. Deseja trocar para outro aluno?`
        : `A configuracao global do Git ja possui uma identidade ativa (${target}). Deseja substitui-la?`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      actionLabel,
      'Cancelar'
    );

    if (choice !== actionLabel) {
      throw new UserCancelledError('A operacao foi cancelada pelo usuario.');
    }
  }

  private async promptForStudentIdentity(
    initialIdentity: Partial<StudentIdentity>
  ): Promise<StudentIdentity> {
    const name = await vscode.window.showInputBox({
      title: `${EXTENSION_NAME}: nome do aluno`,
      prompt: 'Informe o nome que deve aparecer nos commits desta maquina.',
      placeHolder: 'Nome completo do aluno',
      value: initialIdentity.name ?? '',
      ignoreFocusOut: true,
      validateInput: validateStudentName
    });

    if (name === undefined) {
      throw new UserCancelledError('O nome do aluno nao foi informado.');
    }

    const email = await vscode.window.showInputBox({
      title: `${EXTENSION_NAME}: e-mail do aluno`,
      prompt: 'Informe o e-mail que deve aparecer nos commits desta maquina.',
      placeHolder: 'aluno@universidade.br',
      value: initialIdentity.email ?? '',
      ignoreFocusOut: true,
      validateInput: validateStudentEmail
    });

    if (email === undefined) {
      throw new UserCancelledError('O e-mail do aluno nao foi informado.');
    }

    return normalizeStudentIdentity(name, email);
  }

  private createPersistedSession(
    authSession: vscode.AuthenticationSession,
    identity: StudentIdentity
  ): PersistedSessionState {
    return {
      version: 2,
      studentName: identity.name,
      studentEmail: identity.email,
      githubAccountId: authSession.account.id,
      githubAccountLabel: authSession.account.label,
      githubSessionId: authSession.id,
      scopes: authSession.scopes.length > 0 ? authSession.scopes : GITHUB_AUTH_SCOPES,
      activatedAt: new Date().toISOString()
    };
  }

  private buildInitialIdentity(
    globalIdentity: Partial<StudentIdentity>,
    storedSession?: PersistedSessionState
  ): Partial<StudentIdentity> {
    const initialIdentity: Partial<StudentIdentity> = {};

    const name = globalIdentity.name ?? storedSession?.studentName;
    const email = globalIdentity.email ?? storedSession?.studentEmail;

    if (name) {
      initialIdentity.name = name;
    }

    if (email) {
      initialIdentity.email = email;
    }

    return initialIdentity;
  }
}
