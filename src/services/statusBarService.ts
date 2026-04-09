import * as vscode from 'vscode';
import { COMMANDS, EXTENSION_NAME, STATUS_BAR_PRIORITY } from '../constants';
import { StatusBarViewModel } from '../types';

export class StatusBarService implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    STATUS_BAR_PRIORITY
  );

  private currentViewModel?: StatusBarViewModel;

  public constructor() {
    this.item.name = EXTENSION_NAME;
    this.item.command = COMMANDS.handleStatusBarClick;
    this.item.accessibilityInformation = {
      label: EXTENSION_NAME
    };
    this.item.show();
  }

  public getViewModel(): StatusBarViewModel | undefined {
    return this.currentViewModel;
  }

  public update(viewModel: StatusBarViewModel): void {
    this.currentViewModel = viewModel;
    this.item.text = viewModel.text;
    this.item.tooltip = viewModel.tooltip;
    this.item.color = viewModel.color;
    this.item.backgroundColor = viewModel.backgroundColor;
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }
}
