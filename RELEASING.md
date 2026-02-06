# Releasing

This document describes how to release a new version of the LinePeek extension.

## Prerequisites

- You must have write access to the repository
- You must have the VS Code Marketplace Personal Access Token (`VSCE_PAT`)
- You must have the Open VSX Registry Personal Access Token (`OVSX_PAT`)

## Setting Up Tokens

### VS Code Marketplace

1. Go to [Azure DevOps](https://dev.azure.com/)
2. Create a Personal Access Token with the **Marketplace** scope (Publish)
3. Add it as `VSCE_PAT` in your repository's GitHub Secrets

### Open VSX Registry

1. Go to [Open VSX](https://open-vsx.org/)
2. Log in and generate a Personal Access Token
3. Add it as `OVSX_PAT` in your repository's GitHub Secrets

## Release Process

### Option 1: Using standard-version (Recommended)

The project uses [standard-version](https://github.com/conventional-changelog/standard-version) for automated version management and changelog generation.

```bash
# Preview what would be released (dry run)
npm run release:dry

# Release a patch version (0.0.1 -> 0.0.2)
npm run release:patch

# Release a minor version (0.0.x -> 0.1.0)
npm run release:minor

# Release a major version (0.x.x -> 1.0.0)
npm run release:major

# Release a prerelease version
npm run prerelease
```

The `release` command will:

1. Bump the version in `package.json`
2. Update `CHANGELOG.md` with new changes
3. Create a new commit with the version bump
4. Create a git tag (e.g., `v0.1.0`)

After running the release command:

```bash
# Push the commit and tag to trigger the GitHub Actions release workflow
git push --follow-tags origin main
```

### Option 2: Using npm version

If you prefer a simpler approach without changelog generation:

```bash
# Bump version (patch, minor, or major)
npm run version:patch  # or version:minor / version:major

# Push to trigger release
git push --follow-tags origin main
```

### Option 3: Manual Release

If you need to release manually without GitHub Actions:

```bash
# Build and package locally
npm run package

# Publish to VS Code Marketplace
npm run publish:vsce

# Publish to Open VSX Registry (optional)
npm run publish:ovsx
```

## Commit Message Convention

For automatic changelog generation, use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - A new feature (triggers minor version bump)
- `fix:` - A bug fix (triggers patch version bump)
- `docs:` - Documentation only changes
- `style:` - Code style changes (formatting, missing semi colons, etc)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding or correcting tests
- `chore:` - Changes to the build process or auxiliary tools

Examples:

```bash
git commit -m "feat: add support for custom file patterns"
git commit -m "fix: correct line count for binary files"
git commit -m "docs: update README with new configuration options"
```

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality (backwards compatible)
- **PATCH** version for bug fixes (backwards compatible)
