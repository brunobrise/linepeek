import * as vscode from 'vscode';
import * as fs from 'fs';

// Configuration constants
const CONFIG_SECTION = 'linepeek';
const IGNORED_EXTENSIONS_CONFIG = 'ignoredFileExtensions';
const ENABLE_CONFIG = 'enable';

export function activate(context: vscode.ExtensionContext) {
  console.log('LinePeek is now active');

  const lineCountProvider = new LineCountDecorationProvider();

  context.subscriptions.push(vscode.window.registerFileDecorationProvider(lineCountProvider));

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        lineCountProvider.reloadConfig();
        lineCountProvider.updateAllDecorations();
      }
    })
  );

  // Listen for file saves to update the count
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      lineCountProvider.updateDecorationForUri(doc.uri);
    })
  );
}

export function deactivate() {}

class LineCountDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private cache = new Map<string, number>();
  private ignoredExtensions = new Set<string>();
  private isEnabled = true;

  constructor() {
    this.reloadConfig();
  }

  public reloadConfig() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    this.isEnabled = config.get<boolean>(ENABLE_CONFIG, true);

    const ignored = config.get<string[]>(IGNORED_EXTENSIONS_CONFIG, []);
    this.ignoredExtensions = new Set(ignored.map((ext) => ext.toLowerCase().replace(/^\./, '')));
  }

  public updateAllDecorations() {
    // Clearing cache forces re-calculation when requested
    this.cache.clear();
    this._onDidChangeFileDecorations.fire(undefined);
  }

  public updateDecorationForUri(uri: vscode.Uri) {
    this.cache.delete(uri.toString());
    this._onDidChangeFileDecorations.fire(uri);
  }

  async provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): Promise<vscode.FileDecoration | undefined> {
    if (!this.isEnabled) {
      return undefined;
    }

    if (uri.scheme !== 'file') {
      return undefined;
    }

    // Check simple extension ignore list first (fastest)
    const ext = uri.path.split('.').pop()?.toLowerCase();
    if (ext && this.ignoredExtensions.has(ext)) {
      return undefined;
    }

    // Return cached value if available
    const uriString = uri.toString();
    if (this.cache.has(uriString)) {
      const count = this.cache.get(uriString);
      return this.createDecoration(count!);
    }

    // Calculate line count
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) {
        return undefined; // Do not decorate directories
      }

      // Limit file size to avoid performance issues (e.g. 10MB limit)
      if (stat.size > 10 * 1024 * 1024) {
        return undefined;
      }

      const count = await this.countLines(uri.fsPath);
      this.cache.set(uriString, count);
      return this.createDecoration(count);
    } catch (error) {
      // Fail silently for file reading errors
      return undefined;
    }
  }

  private createDecoration(count: number): vscode.FileDecoration {
    return {
      badge: `${count}`,
      tooltip: `${count} lines`,
      color: new vscode.ThemeColor('descriptionForeground'),
    };
  }

  private countLines(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk: Buffer | string) => {
        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk);
        }
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] === 10) {
            // 10 is '\n'
            count++;
          }
        }
      });

      stream.on('end', () => {
        // Add 1 because a file with 1 line has 0 newlines, usually we want "lines of code" or visual lines
        // However, standard line counting usually counts newlines.
        // Let's adopt the standard editor behavior: usually line numbers start at 1.
        // If file is empty, 0. If file has "a", it has 1 line (0 newlines).
        // If file has "a\n", it has 1 line or 2? Editors usually show line 2 as empty.
        // We will stick to: 0 newlines = 1 line (if size > 0).

        // Correction: if the file is completely empty, lines = 0.
        // If not empty, lines = newlines + 1 (generally).
        // Let's refine based on file size check done outside.
        // If file size > 0 and no newlines, it's 1 line.
        // If file size > 0 and 1 newline at end, it's 1 line? or 2?
        // `wc -l` counts newlines. VS Code line numbers are newlines + 1.
        // Let's emulate VS Code line number approach loosely (newlines + 1).

        if (count === 0) {
          // Check if file is truly empty
          fs.stat(filePath, (err, stats) => {
            if (err) {
              resolve(0);
              return;
            }
            if (stats.size === 0) {
              resolve(0);
            } else {
              resolve(1);
            }
          });
        } else {
          // If the last character is NOT a newline, we should add one?
          // Actually, simplest approximation is newlines + 1 for most source code files.
          resolve(count + 1);
        }
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }
}
