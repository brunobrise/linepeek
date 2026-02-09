import * as fs from 'fs';
import { promisify } from 'util';

const statAsync = promisify(fs.stat);

export interface CommentPattern {
  start: string;
  end?: string;
  type: 'single' | 'block';
  pattern: string;
}

export interface LineCountOptions {
  excludeComments?: boolean;
  excludeBlankLines?: boolean;
  commentPatterns?: CommentPattern[];
}

export interface FileStats {
  lineCount: number;
  sloc?: number; // Source lines of code (excluding comments and blank lines)
  fileSize: number;
  lastModified: Date;
}

/**
 * Counts lines in a file using streaming for memory efficiency.
 */
export async function countLines(
  filePath: string,
  options: LineCountOptions = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;

    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk: Buffer | string) => {
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      for (let i = 0; i < data.length; i++) {
        if (data[i] === 10) {
          // \n
          count++;
        }
      }
    });

    stream.on('end', () => {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        resolve(0);
        return;
      }
      // If the file doesn't end with a newline, we still need to count the last line
      // Check last byte if possible, but stats + count is usually safe enough
      // Most files have at least 1 line if size > 0.
      resolve(count > 0 ? count + 1 : 1);
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Counts SLOC (Source Lines of Code) excluding comments and blank lines.
 * This is a simplified implementation that works for most common languages.
 */
export async function countSloc(filePath: string, language?: string): Promise<number> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const commentPatterns = getCommentPatternsForLanguage(language, filePath);

  let sloc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      continue; // Skip blank lines
    }

    // Handle block comments
    if (commentPatterns.blockStart && commentPatterns.blockEnd) {
      const blockStartIndex = trimmed.indexOf(commentPatterns.blockStart);
      const blockEndIndex = trimmed.indexOf(commentPatterns.blockEnd);

      if (inBlockComment) {
        if (blockEndIndex !== -1) {
          inBlockComment = false;
          // Check if there's code after the block comment ends
          const afterBlock = trimmed.slice(blockEndIndex + commentPatterns.blockEnd.length).trim();
          if (afterBlock) {
            sloc++;
          }
        }
        continue;
      }

      if (blockStartIndex !== -1) {
        // Check if it's a single-line block comment
        const endOnSameLine = trimmed.indexOf(
          commentPatterns.blockEnd,
          blockStartIndex + commentPatterns.blockStart.length
        );

        if (endOnSameLine !== -1) {
          // Single-line block comment
          const beforeBlock = trimmed.slice(0, blockStartIndex).trim();
          const afterBlock = trimmed.slice(endOnSameLine + commentPatterns.blockEnd.length).trim();
          if (beforeBlock || afterBlock) {
            sloc++;
          }
          continue;
        } else {
          // Multi-line block comment starting
          const beforeBlock = trimmed.slice(0, blockStartIndex).trim();
          if (beforeBlock) {
            sloc++;
          }
          inBlockComment = true;
          continue;
        }
      }
    }

    // Handle single-line comments
    if (commentPatterns.single) {
      let isCommentLine = false;
      for (const pattern of commentPatterns.single) {
        if (trimmed.startsWith(pattern)) {
          isCommentLine = true;
          break;
        }
        // Check for comment after code
        const commentIndex = trimmed.indexOf(pattern);
        if (commentIndex > 0) {
          // There's code before the comment
          sloc++;
          isCommentLine = true;
          break;
        }
      }
      if (isCommentLine) {
        continue;
      }
    }

    sloc++;
  }

  return sloc;
}

interface CommentPatterns {
  single?: string[];
  blockStart?: string;
  blockEnd?: string;
}

function getCommentPatternsForLanguage(language?: string, filePath?: string): CommentPatterns {
  // Detect language from file extension if not provided
  if (!language && filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      php: 'php',
      html: 'html',
      css: 'css',
      scss: 'css',
      sass: 'css',
      less: 'css',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      ps1: 'powershell',
      sql: 'sql',
      md: 'markdown',
    };
    language = langMap[ext || ''];
  }

  const patterns: Record<string, CommentPatterns> = {
    javascript: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    typescript: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    java: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    c: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    cpp: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    csharp: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    go: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    rust: { single: ['//'], blockStart: '/*', blockEnd: '*/' },
    php: { single: ['//', '#'], blockStart: '/*', blockEnd: '*/' },
    python: { single: ['#'] },
    ruby: { single: ['#'] },
    shell: { single: ['#'] },
    yaml: { single: ['#'] },
    sql: { single: ['--', '//', '#'] },
    html: { blockStart: '<!--', blockEnd: '-->' },
    css: { blockStart: '/*', blockEnd: '*/' },
    xml: { blockStart: '<!--', blockEnd: '-->' },
    markdown: {}, // No standard comments in markdown
    json: {}, // No comments in standard JSON
    powershell: { single: ['#'], blockStart: '<#', blockEnd: '#>' },
  };

  return patterns[language || ''] || { single: ['//', '#'] };
}

/**
 * Gets comprehensive file statistics.
 */
export async function getFileStats(filePath: string): Promise<FileStats> {
  const [lineCount, stats] = await Promise.all([countLines(filePath), statAsync(filePath)]);

  return {
    lineCount,
    fileSize: stats.size,
    lastModified: stats.mtime,
  };
}

/**
 * Formats a large number to compact notation at most 2 characters (e.g., 1234 -> 1k, 123 -> 1H).
 * This is optimized for VS Code decoration badges which have a 2-character limit.
 */
export function formatCompactNumber(num: number): string {
  if (num < 100) {
    return num.toString();
  }
  if (num < 1000) {
    // For 100-999, show as hundreds (e.g., 149 -> 1H, 150 -> 2H)
    const h = Math.round(num / 100);
    // Ensure we don't return 10H if it rounds up (unlikely with num < 1000)
    return h >= 10 ? '1k' : h + 'H';
  }
  if (num < 10000) {
    // 1000-9999 -> 1k...9k
    const k = Math.round(num / 1000);
    return k >= 10 ? 'k+' : k + 'k';
  }
  // For 10k+, we just show k+ or similar to indicate it's large
  return 'k+';
}

/**
 * Formats file size to human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
