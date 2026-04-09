export const EXTENSION_NAME = 'LasecGitSession';

export const COMMANDS = {
  handleStatusBarClick: 'lasecGitSession.handleStatusBarClick',
  startSession: 'lasecGitSession.startSession',
  endSession: 'lasecGitSession.endSession',
  switchStudent: 'lasecGitSession.switchStudent',
  showStatus: 'lasecGitSession.showStatus'
} as const;

export const STORAGE_KEYS = {
  activeSession: 'lasecGitSession.activeSession'
} as const;

export const GITHUB_AUTH_PROVIDER = 'github';
export const GITHUB_AUTH_SCOPES = ['read:user'] as const;

export const GIT_CONFIG_KEYS = {
  userName: 'user.name',
  userEmail: 'user.email'
} as const;

export const OPTIONAL_GIT_CREDENTIAL_KEYS = [
  'credential.username',
  'github.user'
] as const;

export const STATUS_BAR_PRIORITY = 1000;
export const GIT_COMMAND_TIMEOUT_MS = 15_000;
