# LinePeek

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://marketplace.visualstudio.com/items?itemName=brunobrise.linepeek)
[![VS Code Version](https://img.shields.io/badge/vscode-%5E1.90.0-blue.svg)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white)](https://conventionalcommits.org)

> Display line counts directly in the VS Code Explorer

LinePeek is a lightweight Visual Studio Code extension that shows the number of lines in each file as a badge in the Explorer sidebar, helping you quickly identify file sizes and navigate large codebases with ease.

![LinePeek Demo](linepeek.png)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Features

- ⚡ **High Performance** – Stream-based file reading and intelligent caching ensure minimal impact on VS Code's performance, even in large workspaces
- 🎯 **Unobtrusive Design** – Line counts appear as subtle badges that don't clutter the Explorer view
- ⚙️ **Configurable** – Customize which file types to ignore based on extension
- 🔄 **Real-time Updates** – Line counts automatically refresh when files are saved
- 🛡️ **Smart Filtering** – Automatically skips binary files, large files (>10MB), and directories
- 🎨 **Theme Aware** – Uses VS Code's native theming for consistent appearance

---

## Installation

### From the VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search for "LinePeek"
4. Click **Install**

### From the Command Line

```bash
code --install-extension brunobrise.linepeek
```

### From Open VSX Registry

For VS Code-compatible editors (VSCodium, etc.):

```bash
wget https://open-vsx.org/api/brunobrise/linepeek/0.0.1/file/brunobrise.linepeek-0.0.1.vsix
```

---

## Usage

LinePeek works automatically once installed. Open any folder in VS Code and you'll see line counts displayed as badges next to files in the Explorer sidebar.

### What Gets Counted

- ✅ Text files with valid extensions
- ✅ Files smaller than 10MB
- ✅ Files with standard line endings (LF, CRLF)

### What Gets Skipped

- ❌ Directories and virtual folders
- ❌ Binary files (images, videos, archives, executables)
- ❌ Files larger than 10MB (performance protection)
- ❌ Files with extensions in your ignore list

---

## Configuration

LinePeek can be configured through VS Code settings. Access settings with `Cmd+,` (macOS) or `Ctrl+,` (Windows/Linux).

### Settings

| Setting                          | Type       | Default                                       | Description                                       |
| -------------------------------- | ---------- | --------------------------------------------- | ------------------------------------------------- |
| `linepeek.enable`                | `boolean`  | `true`                                        | Enable or disable line count decorations globally |
| `linepeek.ignoredFileExtensions` | `string[]` | See [list below](#default-ignored-extensions) | File extensions to exclude from line counting     |

### Default Ignored Extensions

The following extensions are ignored by default to avoid counting binary or non-text files:

| Category        | Extensions                                                              |
| --------------- | ----------------------------------------------------------------------- |
| **Images**      | `png`, `jpg`, `jpeg`, `gif`, `bmp`, `ico`, `tiff`, `webp`, `svg`        |
| **Video**       | `mp4`, `mov`, `avi`, `mkv`                                              |
| **Audio**       | `mp3`, `wav`, `flac`                                                    |
| **Archives**    | `zip`, `tar`, `gz`, `7z`, `rar`                                         |
| **Executables** | `exe`, `dll`, `so`, `dylib`, `bin`                                      |
| **Documents**   | `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `odt`, `ods`, `odp` |
| **Disk Images** | `iso`                                                                   |

### Custom Configuration Example

Add to your `.vscode/settings.json` or global VS Code settings:

```json
{
  "linepeek.enable": true,
  "linepeek.ignoredFileExtensions": ["png", "jpg", "min.js", "map", "lock"]
}
```

### Disabling for Specific Workspaces

To disable LinePeek for a specific project, add to that project's `.vscode/settings.json`:

```json
{
  "linepeek.enable": false
}
```

---

## How It Works

LinePeek uses VS Code's [FileDecorationProvider API](https://code.visualstudio.com/api/references/vscode-api#FileDecorationProvider) to add badges to file items in the Explorer. Here's how it operates:

1. **Lazy Loading** – Line counts are calculated only when files become visible in the Explorer
2. **Stream-Based Reading** – Uses Node.js streams to count newlines without loading entire files into memory
3. **Smart Caching** – Caches results to avoid re-reading files that haven't changed
4. **Incremental Updates** – Clears cache entries only for files that are modified or saved
5. **Size Limits** – Skips files over 10MB to maintain IDE responsiveness

### Line Counting Logic

LinePeek uses a counting algorithm that matches standard editor behavior:

- Empty file → `0` lines
- File with content but no newlines → `1` line
- File with newlines → newline count + 1

This matches how VS Code and most editors display line numbers.

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Setting up your development environment
- Coding standards and conventions
- Submitting pull requests
- Commit message conventions (we use [Conventional Commits](https://conventionalcommits.org/))

### Quick Start for Contributors

```bash
# Clone the repository
git clone https://github.com/brunobrise/linepeek.git
cd linepeek

# Install dependencies
npm install

# Start development mode
npm run watch
```

Press `F5` in VS Code to launch the extension in a new Extension Development Host window.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes and releases.

### Latest Release (0.0.1)

- Initial release with core line counting functionality
- Configuration support for enable/disable and ignored extensions
- Efficient caching system
- Real-time updates on file save
- Large file protection (>10MB)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Uses [esbuild](https://esbuild.github.io/) for fast bundling
- Follows [Conventional Commits](https://conventionalcommits.org/) specification
- Inspired by the need for quick file size assessment in large codebases

---

## Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/brunobrise/linepeek/issues)
- 💡 **Feature Requests**: [Open an issue](https://github.com/brunobrise/linepeek/issues)
- ❓ **Questions**: [Start a discussion](https://github.com/brunobrise/linepeek/discussions)

---

<p align="center">Made with ❤️ by <a href="https://github.com/brunobrise">Bruno Brise</a></p>
