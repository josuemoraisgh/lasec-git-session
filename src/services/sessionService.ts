import * as vscode from 'vscode';
import { STORAGE_KEYS } from '../constants';
import { PersistedSessionState } from '../types';

export class SessionService {
  public constructor(private readonly globalState: vscode.Memento) {}

  public getSession(): PersistedSessionState | undefined {
    return this.globalState.get<PersistedSessionState>(STORAGE_KEYS.activeSession);
  }

  public async saveSession(session: PersistedSessionState): Promise<void> {
    await this.globalState.update(STORAGE_KEYS.activeSession, session);
  }

  public async clearSession(): Promise<void> {
    await this.globalState.update(STORAGE_KEYS.activeSession, undefined);
  }
}
