import * as path from 'node:path';
import * as vscode from 'vscode';

export function getPreferredWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;

  if (activeEditorUri) {
    const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditorUri);
    if (activeFolder) {
      return activeFolder;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}

export function isLocalWorkspaceFolder(folder: vscode.WorkspaceFolder): boolean {
  return folder.uri.scheme === 'file';
}

export function normalizeRepositoryKey(repositoryRoot: string): string {
  const normalized = path.resolve(repositoryRoot).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
