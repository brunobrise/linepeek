# LinePeek

**LinePeek** is a lightweight Visual Studio Code extension that displays the line count of files directly in the Explorer view.

![LinePeek Screenshot](https://via.placeholder.com/600x400?text=LinePeek+Screenshot+Placeholder)

## Features

- **Performance First**: Optimized to handle large workspaces without slowing down VS Code.
- **Unobtrusive**: Displays line counts cleanly next to filenames.
- **Configurable**: Easily ignore specific file extensions.
- **Cached**: Uses efficient caching to minimize file system reads.

## Extension Settings

This extension contributes the following settings:

- `linepeek.enable`: Enable/disable the extension.
- `linepeek.ignoredFileExtensions`: Array of file extensions to ignore (e.g. `['json', 'lock']`).

## Release Notes

### 0.0.1

Initial release of LinePeek.
