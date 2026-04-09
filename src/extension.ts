import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { SessionController } from './controllers/sessionController';
import { AuthService } from './services/authService';
import { CredentialCleanupService } from './services/credentialCleanupService';
import { GitService } from './services/gitService';
import { LoggerService } from './services/loggerService';
import { SessionService } from './services/sessionService';
import { StatusBarService } from './services/statusBarService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new LoggerService();
  const gitService = new GitService(logger);
  const authService = new AuthService(logger);
  const sessionService = new SessionService(context.globalState);
  const statusBarService = new StatusBarService();
  const credentialCleanupService = new CredentialCleanupService(gitService);

  const controller = new SessionController({
    authService,
    credentialCleanupService,
    gitService,
    logger,
    sessionService,
    statusBarService
  });

  context.subscriptions.push(logger, statusBarService);
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.handleStatusBarClick, () =>
      controller.handleStatusBarClick()
    ),
    vscode.commands.registerCommand(COMMANDS.startSession, () =>
      controller.startSession()
    ),
    vscode.commands.registerCommand(COMMANDS.endSession, () =>
      controller.endSession()
    ),
    vscode.commands.registerCommand(COMMANDS.switchStudent, () =>
      controller.switchStudent()
    ),
    vscode.commands.registerCommand(COMMANDS.showStatus, () =>
      controller.showStatus()
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void controller.refreshStatus();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void controller.refreshStatus();
    }),
    vscode.window.onDidChangeWindowState(() => {
      void controller.refreshStatus();
    }),
    vscode.authentication.onDidChangeSessions((event) => {
      controller.handleAuthenticationSessionsChanged(event);
    })
  );

  await controller.refreshStatus();
}

export function deactivate(): void {}
