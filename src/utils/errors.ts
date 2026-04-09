export class UserCancelledError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UserCancelledError';
  }
}

export function isUserCancelledError(error: unknown): boolean {
  if (error instanceof UserCancelledError) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return fallback;
}
