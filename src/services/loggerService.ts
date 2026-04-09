import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../constants';

export class LoggerService implements vscode.Disposable {
  private readonly outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);

  public info(message: string, metadata?: unknown): void {
    this.append('INFO', message, metadata);
  }

  public warn(message: string, metadata?: unknown): void {
    this.append('WARN', message, metadata);
  }

  public error(message: string, metadata?: unknown): void {
    this.append('ERROR', message, metadata);
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }

  private append(level: string, message: string, metadata?: unknown): void {
    const timestamp = new Date().toISOString();
    const serializedMetadata = metadata === undefined ? '' : ` ${this.serialize(metadata)}`;
    this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}${serializedMetadata}`);
  }

  private serialize(metadata: unknown): string {
    if (metadata instanceof Error) {
      return metadata.stack ?? metadata.message;
    }

    try {
      return JSON.stringify(metadata);
    } catch {
      return String(metadata);
    }
  }
}
