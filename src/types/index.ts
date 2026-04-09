import * as vscode from 'vscode';

export type StatusBarMode = 'disconnected' | 'connected' | 'error' | 'busy';

export interface StudentIdentity {
  name: string;
  email: string;
}

export interface IdentityState {
  name?: string;
  email?: string;
}

export interface PersistedSessionState {
  version: 2;
  studentName: string;
  studentEmail: string;
  githubAccountId?: string;
  githubAccountLabel?: string;
  githubSessionId?: string;
  scopes: readonly string[];
  activatedAt: string;
}

export interface GitHubSessionStatus {
  isAvailable: boolean;
  description: string;
  accountLabel?: string;
}

export interface SessionStatusSnapshot {
  gitAvailable: boolean;
  globalIdentity: IdentityState;
  storedSession?: PersistedSessionState;
  githubStatus?: GitHubSessionStatus;
  viewMode: StatusBarMode;
  message?: string;
}

export interface StatusBarViewModel {
  mode: StatusBarMode;
  text: string;
  tooltip: string;
  color?: vscode.ThemeColor;
  backgroundColor?: vscode.ThemeColor;
}

export interface CredentialCleanupCandidate {
  key: string;
  value: string;
}

export interface CredentialCleanupResult {
  promptShown: boolean;
  removed: CredentialCleanupCandidate[];
  kept: CredentialCleanupCandidate[];
}

export interface AuthSignInOptions {
  forceNewSession?: boolean;
  detail?: string;
}

export interface AuthDisconnectResult {
  clearedSessionPreference: boolean;
  fullLogoutSupported: boolean;
  note: string;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
