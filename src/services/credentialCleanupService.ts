import * as vscode from 'vscode';
import { OPTIONAL_GIT_CREDENTIAL_KEYS } from '../constants';
import {
  CredentialCleanupCandidate,
  CredentialCleanupResult
} from '../types';
import { GitService } from './gitService';

export class CredentialCleanupService {
  public constructor(private readonly gitService: GitService) {}

  public async cleanupGlobalCredentialResidues(): Promise<CredentialCleanupResult> {
    const candidates = await this.findCandidates();

    if (candidates.length === 0) {
      return {
        promptShown: false,
        removed: [],
        kept: []
      };
    }

    const keys = candidates.map((candidate) => candidate.key).join(', ');
    const choice = await vscode.window.showWarningMessage(
      `Ainda existem configuracoes globais que podem manter referencia de identidade (${keys}). Deseja remove-las tambem?`,
      { modal: true },
      'Remover extras',
      'Manter'
    );

    if (choice !== 'Remover extras') {
      return {
        promptShown: true,
        removed: [],
        kept: candidates
      };
    }

    for (const candidate of candidates) {
      await this.gitService.unsetGlobalConfigValue(candidate.key);
    }

    return {
      promptShown: true,
      removed: candidates,
      kept: []
    };
  }

  private async findCandidates(): Promise<CredentialCleanupCandidate[]> {
    const results = await Promise.all(
      OPTIONAL_GIT_CREDENTIAL_KEYS.map(async (key) => {
        const values = await this.gitService.getGlobalConfigValues(key);
        return values.map<CredentialCleanupCandidate>((value) => ({
          key,
          value
        }));
      })
    );

    return results.flat();
  }
}
