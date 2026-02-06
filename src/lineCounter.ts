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
    let inComment = false;
    let lastWasNewline = false;
    let buffer = '';

    const commentStarts = options.commentPatterns?.map((p) => p.start) || [];
    const commentEnds = options.commentPatterns?.map((p) => p.end) || [];
    const singleLineComments = options.commentPatterns
      ?.filter((p) => p.type === 'single')
      .map((p) => p.pattern) || ['//', '#'];

    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk: Buffer | string) => {
      if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk);
      }

      for (let i = 0; i < chunk.length; i++) {
        const byte = chunk[i];
        buffer += String.fromCharCode(byte);

        if (byte === 10) {
          // Newline
          count++;
          buffer = '';
        }
      }
    });

    stream.on('end', () => {
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
        resolve(count + 1);
      }
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
 * Formats a large number to compact notation (e.g., 1234 -> 1.2k).
 */
export function formatCompactNumber(num: number): string {
  if (num < 1000) {
    return num.toString();
  }
  if (num < 1000000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
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
