import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import {
  countLines,
  countSloc,
  getFileStats,
  formatCompactNumber,
  formatFileSize,
  FileStats,
} from './lineCounter';

const statAsync = promisify(fs.stat);
const readdirAsync = promisify(fs.readdir);

// Configuration constants
const CONFIG_SECTION = 'linepeek';
const ENABLE_CONFIG = 'enable';
const IGNORED_EXTENSIONS_CONFIG = 'ignoredFileExtensions';
const IGNORED_PATTERNS_CONFIG = 'ignoredPatterns';
const FILE_SIZE_LIMIT_CONFIG = 'fileSizeLimitMB';
const DISPLAY_MODE_CONFIG = 'displayMode'; // 'lines', 'size', 'both'
const USE_COMPACT_NUMBERS_CONFIG = 'useCompactNumbers';
const COLOR_THRESHOLDS_CONFIG = 'colorThresholds';
const SHOW_SLOC_CONFIG = 'showSloc';
const SHOW_DIRECTORY_TOTALS_CONFIG = 'showDirectoryTotals';
const ENABLE_LIVE_UPDATES_CONFIG = 'enableLiveUpdates';
const LIVE_UPDATE_DELAY_CONFIG = 'liveUpdateDelayMs';
const SHOW_GIT_CHANGES_CONFIG = 'showGitChanges';
const SHOW_PERFORMANCE_STATS_CONFIG = 'showPerformanceStats';

// Language-specific settings
interface LanguageSettings {
  colorThresholds?: { small: number; medium: number; large: number };
  showSloc?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('LinePeek is now active');

  const lineCountProvider = new LineCountDecorationProvider();
  const statusBarItem = new PerformanceStatusBar();

  context.subscriptions.push(vscode.window.registerFileDecorationProvider(lineCountProvider));

  // Register command for workspace statistics
  context.subscriptions.push(
    vscode.commands.registerCommand('linepeek.showWorkspaceStats', async () => {
      await showWorkspaceStatistics();
    })
  );

  // Register command to toggle display mode
  context.subscriptions.push(
    vscode.commands.registerCommand('linepeek.toggleDisplayMode', async () => {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const modes = ['lines', 'size', 'both'];
      const current = config.get<string>(DISPLAY_MODE_CONFIG, 'lines');
      const nextIndex = (modes.indexOf(current) + 1) % modes.length;
      await config.update(DISPLAY_MODE_CONFIG, modes[nextIndex], true);
      vscode.window.showInformationMessage(`LinePeek display mode: ${modes[nextIndex]}`);
    })
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        lineCountProvider.reloadConfig();
        lineCountProvider.updateAllDecorations();
      }
    })
  );

  // Listen for file saves
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      lineCountProvider.updateDecorationForUri(doc.uri);
    })
  );

  // Live updates with debouncing
  let debounceTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!lineCountProvider.liveUpdatesEnabled) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        lineCountProvider.updateDecorationForUri(e.document.uri);
      }, lineCountProvider.liveUpdateDelay);
    })
  );

  // Update status bar periodically
  if (statusBarItem.isEnabled) {
    const updateInterval = setInterval(() => {
      statusBarItem.update(lineCountProvider.getStats());
    }, 5000);
    context.subscriptions.push({
      dispose: () => clearInterval(updateInterval),
    });
  }
}

export function deactivate() {}

class LineCountDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private cache = new Map<string, { count: number; size: number; mtime: number }>();
  private ignoredExtensions = new Set<string>();
  private ignoredPatterns: string[] = [];
  private isEnabled = true;
  private fileSizeLimitBytes = 10 * 1024 * 1024;
  private displayMode: 'lines' | 'size' | 'both' = 'lines';
  private useCompactNumbers = true;
  private colorThresholds = { small: 100, medium: 500, large: 1000 };
  private languageSettings: Map<string, LanguageSettings> = new Map();
  private showSloc = false;
  private showDirectoryTotals = false;
  public liveUpdatesEnabled = true;
  public liveUpdateDelay = 1000;
  private showGitChanges = false;
  private showPerformanceStats = false;
  private slocCache = new Map<string, number>();

  // Performance tracking
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalCalculationTime = 0;

  constructor() {
    this.reloadConfig();
  }

  public reloadConfig() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    this.isEnabled = config.get<boolean>(ENABLE_CONFIG, true);

    const ignored = config.get<string[]>(IGNORED_EXTENSIONS_CONFIG, []);
    this.ignoredExtensions = new Set(ignored.map((ext) => ext.toLowerCase().replace(/^\./, '')));

    this.ignoredPatterns = config.get<string[]>(IGNORED_PATTERNS_CONFIG, [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/*.min.js',
      '**/*.map',
    ]);

    const sizeLimitMB = config.get<number>(FILE_SIZE_LIMIT_CONFIG, 10);
    this.fileSizeLimitBytes = sizeLimitMB * 1024 * 1024;

    this.displayMode = config.get(DISPLAY_MODE_CONFIG, 'lines');
    this.useCompactNumbers = config.get<boolean>(USE_COMPACT_NUMBERS_CONFIG, true);
    this.colorThresholds = config.get(COLOR_THRESHOLDS_CONFIG, {
      small: 100,
      medium: 500,
      large: 1000,
    });
    this.showSloc = config.get<boolean>(SHOW_SLOC_CONFIG, false);
    this.showDirectoryTotals = config.get<boolean>(SHOW_DIRECTORY_TOTALS_CONFIG, false);
    this.liveUpdatesEnabled = config.get<boolean>(ENABLE_LIVE_UPDATES_CONFIG, true);
    this.liveUpdateDelay = config.get<number>(LIVE_UPDATE_DELAY_CONFIG, 1000);
    this.showGitChanges = config.get<boolean>(SHOW_GIT_CHANGES_CONFIG, false);
    this.showPerformanceStats = config.get<boolean>(SHOW_PERFORMANCE_STATS_CONFIG, false);

    // Load language-specific settings
    const langConfig = config.get<Record<string, LanguageSettings>>('languageSettings', {});
    this.languageSettings = new Map(Object.entries(langConfig));
  }

  public updateAllDecorations() {
    this.cache.clear();
    this.slocCache.clear();
    this._onDidChangeFileDecorations.fire(undefined);
  }

  public updateDecorationForUri(uri: vscode.Uri) {
    this.cache.delete(uri.toString());
    this.slocCache.delete(uri.toString());
    this._onDidChangeFileDecorations.fire(uri);
  }

  public getStats() {
    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheSize: this.cache.size,
      avgCalculationTime: this.cacheMisses > 0 ? this.totalCalculationTime / this.cacheMisses : 0,
    };
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

    // Check ignored patterns
    if (this.matchesIgnoredPattern(uri.fsPath)) {
      return undefined;
    }

    // Check extension ignore list
    const ext = uri.path.split('.').pop()?.toLowerCase();
    if (ext && this.ignoredExtensions.has(ext)) {
      return undefined;
    }

    try {
      const stat = await vscode.workspace.fs.stat(uri);

      // Handle directories
      if ((stat.type & vscode.FileType.Directory) === vscode.FileType.Directory) {
        if (this.showDirectoryTotals) {
          return await this.getDirectoryDecoration(uri);
        }
        return undefined;
      }

      // File size limit
      if (stat.size > this.fileSizeLimitBytes) {
        return undefined;
      }

      return await this.getFileDecoration(uri, stat);
    } catch (error) {
      return undefined;
    }
  }

  private async getFileDecoration(
    uri: vscode.Uri,
    stat: vscode.FileStat
  ): Promise<vscode.FileDecoration> {
    const uriString = uri.toString();
    const startTime = Date.now();

    // Check cache
    const cached = this.cache.get(uriString);
    if (cached && cached.mtime === stat.mtime) {
      this.cacheHits++;
      return this.createDecoration(cached.count, stat.size, uri);
    }

    this.cacheMisses++;

    // Calculate line count
    const count = await countLines(uri.fsPath);
    const calculationTime = Date.now() - startTime;
    this.totalCalculationTime += calculationTime;

    // Update cache
    this.cache.set(uriString, { count, size: stat.size, mtime: stat.mtime });

    return this.createDecoration(count, stat.size, uri);
  }

  private async getDirectoryDecoration(
    uri: vscode.Uri
  ): Promise<vscode.FileDecoration | undefined> {
    try {
      const totalLines = await this.calculateDirectoryLines(uri.fsPath);
      return this.createDecoration(totalLines, 0, uri, true);
    } catch {
      return undefined;
    }
  }

  private async calculateDirectoryLines(dirPath: string): Promise<number> {
    let total = 0;
    const entries = await readdirAsync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip hidden directories and common ignore patterns
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        const subdirPath = path.join(dirPath, entry.name);
        if (!this.matchesIgnoredPattern(subdirPath)) {
          total += await this.calculateDirectoryLines(subdirPath);
        }
      } else if (entry.isFile()) {
        const filePath = path.join(dirPath, entry.name);
        const ext = path.extname(filePath).slice(1).toLowerCase();

        if (!this.ignoredExtensions.has(ext) && !this.matchesIgnoredPattern(filePath)) {
          try {
            const stats = await statAsync(filePath);
            if (stats.size <= this.fileSizeLimitBytes) {
              const count = await countLines(filePath);
              total += count;
            }
          } catch {
            // Ignore errors
          }
        }
      }
    }

    return total;
  }

  private async createDecoration(
    count: number,
    fileSize: number,
    uri: vscode.Uri,
    isDirectory = false
  ): Promise<vscode.FileDecoration> {
    // Get language-specific thresholds
    const langSettings = this.getLanguageSettings(uri.fsPath);
    const thresholds = langSettings.colorThresholds || this.colorThresholds;

    // Build badge text
    let badge: string;
    if (isDirectory) {
      // For directories, always compact to ensure it fits (Max 2 chars including ∑)
      const compact = formatCompactNumber(count);
      // If it's a single digit, show it, otherwise show a indicator like + or suffix
      if (count < 10) {
        badge = `∑${count}`;
      } else if (compact.endsWith('H')) {
        badge = `∑H`;
      } else if (compact.endsWith('k') || compact.endsWith('+')) {
        badge = `∑k`;
      } else {
        badge = `∑+`;
      }
    } else {
      if (this.displayMode === 'size') {
        badge = formatFileSize(fileSize).split(' ')[0].substring(0, 2);
      } else {
        // For files, use compact notation if enabled or if it exceeds 2 characters
        const fullCount = count.toString();
        badge =
          this.useCompactNumbers || fullCount.length > 2 ? formatCompactNumber(count) : fullCount;
      }
    }
    // Build tooltip
    let tooltip = isDirectory
      ? `${count.toLocaleString()} total lines in directory`
      : `${count.toLocaleString()} lines`;

    if (!isDirectory) {
      tooltip += `\n${formatFileSize(fileSize)}`;

      // Add SLOC if enabled
      if (this.showSloc || langSettings.showSloc) {
        const sloc = await this.getSloc(uri);
        tooltip += `\n${sloc.toLocaleString()} SLOC (excluding comments/blank)`;
      }

      // Add Git changes if enabled
      if (this.showGitChanges) {
        const gitInfo = await this.getGitChanges(uri);
        if (gitInfo) {
          tooltip += `\n\nGit: +${gitInfo.added} -${gitInfo.removed} lines`;
        }
      }
    }

    // Determine color based on line count
    let color: vscode.ThemeColor | vscode.Color | undefined;
    if (!isDirectory) {
      if (count >= thresholds.large) {
        color = new vscode.ThemeColor('errorForeground');
      } else if (count >= thresholds.medium) {
        color = new vscode.ThemeColor('editorWarning.foreground');
      } else if (count >= thresholds.small) {
        color = new vscode.ThemeColor('editorInfo.foreground');
      } else {
        color = new vscode.ThemeColor('descriptionForeground'); // Default color for small files
      }
    } else {
      color = new vscode.ThemeColor('descriptionForeground');
    }

    return { badge, tooltip, color };
  }

  private async getSloc(uri: vscode.Uri): Promise<number> {
    const uriString = uri.toString();
    if (this.slocCache.has(uriString)) {
      return this.slocCache.get(uriString)!;
    }

    const sloc = await countSloc(uri.fsPath);
    this.slocCache.set(uriString, sloc);
    return sloc;
  }

  private async getGitChanges(
    uri: vscode.Uri
  ): Promise<{ added: number; removed: number } | undefined> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        return undefined;
      }

      const git = gitExtension.exports.getAPI(1);
      if (!git) {
        return undefined;
      }

      const repo = git.repositories.find((r: any) => uri.fsPath.startsWith(r.rootUri.fsPath));
      if (!repo) {
        return undefined;
      }

      // Get diff for the file
      const changes = await repo.diffWithHEAD(uri.fsPath);
      if (!changes) {
        return undefined;
      }

      // Parse the diff to count additions/deletions
      const added = (changes.match(/^\+[^+]/gm) || []).length;
      const removed = (changes.match(/^-[^-]/gm) || []).length;

      return { added, removed };
    } catch {
      return undefined;
    }
  }

  private matchesIgnoredPattern(filePath: string): boolean {
    const relativePath = vscode.workspace.asRelativePath(filePath);

    for (const pattern of this.ignoredPatterns) {
      if (this.matchGlob(relativePath, pattern)) {
        return true;
      }
      // Also check absolute path
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    // Simple glob matching - convert glob to regex
    const regex = globToRegex(pattern);
    return regex.test(filePath);
  }

  private getLanguageSettings(filePath: string): LanguageSettings {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (!ext) {
      return {};
    }
    return this.languageSettings.get(ext) || {};
  }
}

class PerformanceStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  public isEnabled: boolean;

  constructor() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    this.isEnabled = config.get<boolean>(SHOW_PERFORMANCE_STATS_CONFIG, false);

    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = '$(sync~spin) LinePeek';
    this.statusBarItem.tooltip = 'LinePeek Performance Stats';

    if (this.isEnabled) {
      this.statusBarItem.show();
    }
  }

  update(stats: {
    cacheHits: number;
    cacheMisses: number;
    cacheSize: number;
    avgCalculationTime: number;
  }) {
    if (!this.isEnabled) {
      return;
    }

    const total = stats.cacheHits + stats.cacheMisses;
    const hitRate = total > 0 ? ((stats.cacheHits / total) * 100).toFixed(1) : '0';

    this.statusBarItem.text = `$(file-code) LP: ${hitRate}% hit`;
    this.statusBarItem.tooltip = [
      `LinePeek Cache Stats:`,
      `Hit Rate: ${hitRate}%`,
      `Hits: ${stats.cacheHits.toLocaleString()}`,
      `Misses: ${stats.cacheMisses.toLocaleString()}`,
      `Cached Files: ${stats.cacheSize}`,
      `Avg Calc Time: ${stats.avgCalculationTime.toFixed(1)}ms`,
    ].join('\n');
  }
}

async function showWorkspaceStatistics() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const fileSizeLimitBytes = config.get<number>(FILE_SIZE_LIMIT_CONFIG, 10) * 1024 * 1024;
  const ignoredExtensions = new Set(config.get<string[]>(IGNORED_EXTENSIONS_CONFIG, []));
  const ignoredPatterns = config.get<string[]>(IGNORED_PATTERNS_CONFIG, [
    '**/node_modules/**',
    '**/.git/**',
  ]);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showInformationMessage('No workspace folder open');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Calculating workspace statistics...',
      cancellable: true,
    },
    async (progress, token) => {
      let totalFiles = 0;
      let totalLines = 0;
      let totalSize = 0;
      const languageStats: Map<string, { files: number; lines: number }> = new Map();

      for (const folder of workspaceFolders) {
        if (token.isCancellationRequested) {
          break;
        }

        await scanDirectory(folder.uri.fsPath, {
          fileSizeLimitBytes,
          ignoredExtensions,
          ignoredPatterns,
          onFile: async (filePath, stats) => {
            if (token.isCancellationRequested) {
              return;
            }

            totalFiles++;
            totalLines += stats.lineCount;
            totalSize += stats.fileSize;

            // Track by language
            const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown';
            const langStats = languageStats.get(ext) || { files: 0, lines: 0 };
            langStats.files++;
            langStats.lines += stats.lineCount;
            languageStats.set(ext, langStats);

            if (totalFiles % 100 === 0) {
              progress.report({
                message: `Scanned ${totalFiles.toLocaleString()} files...`,
              });
            }
          },
          shouldIgnore: (filePath) => {
            for (const pattern of ignoredPatterns) {
              if (matchGlob(filePath, pattern)) {
                return true;
              }
            }
            return false;
          },
        });
      }

      if (token.isCancellationRequested) {
        vscode.window.showInformationMessage('Statistics calculation cancelled');
        return;
      }

      // Sort languages by line count
      const sortedLanguages = Array.from(languageStats.entries()).sort(
        (a, b) => b[1].lines - a[1].lines
      );

      // Show results
      const message = [
        `📊 Workspace Statistics`,
        ``,
        `Total Files: ${totalFiles.toLocaleString()}`,
        `Total Lines: ${totalLines.toLocaleString()}`,
        `Total Size: ${formatFileSize(totalSize)}`,
        ``,
        `Top 5 Languages by Lines:`,
        ...sortedLanguages.slice(0, 5).map(([lang, stats]) => {
          const percentage = ((stats.lines / totalLines) * 100).toFixed(1);
          return `  ${lang}: ${stats.lines.toLocaleString()} lines (${stats.files} files, ${percentage}%)`;
        }),
      ].join('\n');

      const copyAction = 'Copy to Clipboard';
      const result = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        copyAction
      );

      if (result === copyAction) {
        await vscode.env.clipboard.writeText(message);
        vscode.window.showInformationMessage('Statistics copied to clipboard');
      }
    }
  );
}

async function scanDirectory(
  dirPath: string,
  options: {
    fileSizeLimitBytes: number;
    ignoredExtensions: Set<string>;
    ignoredPatterns: string[];
    onFile: (filePath: string, stats: FileStats) => Promise<void>;
    shouldIgnore: (filePath: string) => boolean;
  }
): Promise<void> {
  const entries = await readdirAsync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip hidden directories and common patterns
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        options.shouldIgnore(fullPath)
      ) {
        continue;
      }
      await scanDirectory(fullPath, options);
    } else if (entry.isFile()) {
      const ext = path.extname(fullPath).slice(1).toLowerCase();

      if (options.ignoredExtensions.has(ext) || options.shouldIgnore(fullPath)) {
        continue;
      }

      try {
        const fileStat = await statAsync(fullPath);
        if (fileStat.size > options.fileSizeLimitBytes) {
          continue;
        }

        const stats = await getFileStats(fullPath);
        await options.onFile(fullPath, stats);
      } catch {
        // Ignore errors
      }
    }
  }
}

function globToRegex(pattern: string): RegExp {
  // Escape regex special characters except for wildcards *, **, ?
  // We want to handle them as wildcards, so we escape everything else and then process them.
  let regex = pattern
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&') // Escape all regex chars including * and ?
    .replace(/\\\*\\\*/g, '___GLOBSTAR___') // Handle **
    .replace(/\\\*/g, '___STAR___') // Handle *
    .replace(/\\\?/g, '___QM___'); // Handle ?

  // Handle globstars (**) - handle both escaped and unescaped slashes
  regex = regex
    .replace(/___GLOBSTAR___(\\\/|\/)?/g, '(.*$1)?')
    .replace(/___STAR___/g, '[^/]*')
    .replace(/___QM___/g, '.');

  return new RegExp(`^${regex}$`, 'i');
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(filePath);
}
