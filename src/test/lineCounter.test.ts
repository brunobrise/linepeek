import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  countLines,
  countSloc,
  getFileStats,
  formatCompactNumber,
  formatFileSize,
} from '../lineCounter';

suite('LineCounter Tests', () => {
  let tempDir: string;

  setup(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'linepeek-test-'));
  });

  teardown(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  suite('countLines', () => {
    test('should return 0 for empty file', async () => {
      const filePath = path.join(tempDir, 'empty.txt');
      await fs.promises.writeFile(filePath, '');

      const count = await countLines(filePath);
      assert.strictEqual(count, 0);
    });

    test('should return 1 for single line without newline', async () => {
      const filePath = path.join(tempDir, 'single.txt');
      await fs.promises.writeFile(filePath, 'Hello World');

      const count = await countLines(filePath);
      assert.strictEqual(count, 1);
    });

    test('should count LF newlines correctly', async () => {
      const filePath = path.join(tempDir, 'lf.txt');
      await fs.promises.writeFile(filePath, 'Line 1\nLine 2\nLine 3');

      const count = await countLines(filePath);
      assert.strictEqual(count, 3);
    });

    test('should count CRLF newlines correctly', async () => {
      const filePath = path.join(tempDir, 'crlf.txt');
      await fs.promises.writeFile(filePath, 'Line 1\r\nLine 2\r\nLine 3');

      const count = await countLines(filePath);
      // CRLF counts as 2 lines because \r is not counted as newline,
      // but the \n at the end of \r\n is counted
      assert.strictEqual(count, 3);
    });

    test('should handle file ending with newline', async () => {
      const filePath = path.join(tempDir, 'ending-newline.txt');
      await fs.promises.writeFile(filePath, 'Line 1\nLine 2\n');

      const count = await countLines(filePath);
      assert.strictEqual(count, 3);
    });

    test('should handle large files', async () => {
      const filePath = path.join(tempDir, 'large.txt');
      const content = Array(1000).fill('Line').join('\n');
      await fs.promises.writeFile(filePath, content);

      const count = await countLines(filePath);
      assert.strictEqual(count, 1000);
    });
  });

  suite('countSloc', () => {
    test('should count SLOC for JavaScript file', async () => {
      const filePath = path.join(tempDir, 'test.js');
      const content = [
        '// This is a comment',
        'function hello() {',
        '  // Inline comment',
        '  return "world";',
        '}',
        '',
        '/* Block comment',
        '   spanning multiple lines */',
        'const x = 1;',
      ].join('\n');
      await fs.promises.writeFile(filePath, content);

      const sloc = await countSloc(filePath, 'javascript');
      // Expected SLOC: function hello, return "world";, const x = 1;
      // (blank line and comments excluded)
      assert.strictEqual(sloc, 4);
    });

    test('should count SLOC for Python file', async () => {
      const filePath = path.join(tempDir, 'test.py');
      const content = [
        '# This is a comment',
        'def hello():',
        '    # Another comment',
        '    return "world"',
        '',
        'x = 1  # inline comment',
      ].join('\n');
      await fs.promises.writeFile(filePath, content);

      const sloc = await countSloc(filePath, 'python');
      // Expected: def hello(), return "world", x = 1
      assert.strictEqual(sloc, 3);
    });

    test('should return 0 for comment-only file', async () => {
      const filePath = path.join(tempDir, 'comments.js');
      const content = ['// Comment 1', '// Comment 2', '/*', ' * Block comment', ' */'].join('\n');
      await fs.promises.writeFile(filePath, content);

      const sloc = await countSloc(filePath, 'javascript');
      assert.strictEqual(sloc, 0);
    });

    test('should detect language from extension', async () => {
      const filePath = path.join(tempDir, 'detect.js');
      await fs.promises.writeFile(filePath, '// comment\nconst x = 1;');

      const sloc = await countSloc(filePath);
      // Should detect as JavaScript from .js extension
      assert.strictEqual(sloc, 1);
    });
  });

  suite('getFileStats', () => {
    test('should return correct file stats', async () => {
      const filePath = path.join(tempDir, 'stats.txt');
      const content = 'Line 1\nLine 2\nLine 3';
      await fs.promises.writeFile(filePath, content);

      const stats = await getFileStats(filePath);

      assert.strictEqual(stats.lineCount, 3);
      assert.strictEqual(stats.fileSize, content.length);
      assert.ok(stats.lastModified instanceof Date);
    });
  });

  suite('formatCompactNumber', () => {
    test('should return same number for values under 100', () => {
      assert.strictEqual(formatCompactNumber(0), '0');
      assert.strictEqual(formatCompactNumber(1), '1');
      assert.strictEqual(formatCompactNumber(99), '99');
    });

    test('should format hundreds with H suffix (rounded)', () => {
      assert.strictEqual(formatCompactNumber(100), '1H');
      assert.strictEqual(formatCompactNumber(149), '1H');
      assert.strictEqual(formatCompactNumber(150), '2H');
      assert.strictEqual(formatCompactNumber(949), '9H');
      assert.strictEqual(formatCompactNumber(950), '1k');
    });

    test('should format thousands with k suffix (rounded)', () => {
      assert.strictEqual(formatCompactNumber(1000), '1k');
      assert.strictEqual(formatCompactNumber(1499), '1k');
      assert.strictEqual(formatCompactNumber(1500), '2k');
      assert.strictEqual(formatCompactNumber(9499), '9k');
    });

    test('should use k+ for 9500 and above', () => {
      assert.strictEqual(formatCompactNumber(9500), 'k+');
      assert.strictEqual(formatCompactNumber(10000), 'k+');
      assert.strictEqual(formatCompactNumber(1000000), 'k+');
    });
  });

  suite('formatFileSize', () => {
    test('should format bytes', () => {
      assert.strictEqual(formatFileSize(0), '0 B');
      assert.strictEqual(formatFileSize(100), '100 B');
      assert.strictEqual(formatFileSize(1023), '1023 B');
    });

    test('should format kilobytes', () => {
      assert.strictEqual(formatFileSize(1024), '1 KB');
      assert.strictEqual(formatFileSize(1536), '1.5 KB');
      assert.strictEqual(formatFileSize(10240), '10 KB');
    });

    test('should format megabytes', () => {
      assert.strictEqual(formatFileSize(1024 * 1024), '1 MB');
      assert.strictEqual(formatFileSize(1.5 * 1024 * 1024), '1.5 MB');
      assert.strictEqual(formatFileSize(10 * 1024 * 1024), '10 MB');
    });

    test('should format gigabytes', () => {
      assert.strictEqual(formatFileSize(1024 * 1024 * 1024), '1 GB');
      assert.strictEqual(formatFileSize(2.5 * 1024 * 1024 * 1024), '2.5 GB');
    });
  });
});
