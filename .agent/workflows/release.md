---
description: How to release a new version of the LinePeek extension
---

# Release Procedure for LinePeek

This document outlines the standard workflow for releasing a new version of the LinePeek extension. Following this procedure ensures that versioning is consistent, changelogs are updated, and the extension is correctly published to both the VS Code Marketplace and Open VSX Registry.

## Prerequisites

- You must have a clean working directory (no uncommitted changes).
- Ensure you are on the `main` branch: `git checkout main && git pull origin main`.
- Ensure all tests pass locally: `npm test`.

## Step-by-Step Release Workflow

### 1. Preparation & Commits

Ensure all features or fixes are committed using [Conventional Commits](https://conventionalcommits.org/). This allows `standard-version` to automatically determine the version bump and update the changelog.

- `fix(...)`: Triggers a **patch** release.
- `feat(...)`: Triggers a **minor** release.
- `feat(...)` with `BREAKING CHANGE` in footer: Triggers a **major** release.

### 2. Verify Release (Dry Run)

Before finalizing the release, run a dry run to see exactly what `standard-version` will do.
// turbo

```bash
npm run release:dry
```

Review the output to confirm the version bump and the new entries in the generated `CHANGELOG.md`.

### 3. Execute Release

Finalize the release locally. This will update `package.json`, `package-lock.json`, `CHANGELOG.md`, and create a new git tag.
// turbo

```bash
npm run release
```

_Note: If you need to force a specific version (e.g., skip a pre-release), you can use `npm run release -- --release-as <patch|minor|major>`._

### 4. Push and Publish

Push the new commits and tags to GitHub. This will trigger the dedicated GitHub Action workflow (`publish.yml`) that handles the external publishing.
// turbo

```bash
git push --follow-tags origin main
```

## Automated CI/CD Actions

Once the tag is pushed, the `Release and Publish` GitHub Action performs the following:

1. **Tests**: Runs VS Code extension tests in a headless environment (using `xvfb-run`).
2. **Package**: Bundles the extension into a `.vsix` file.
3. **VS Marketplace**: Publishes the new version to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=brunobrise.linepeek) using the `VSCE_PAT`.
4. **Open VSX**: Publishes the extension to the [Open VSX Registry](https://open-vsx.org/extension/brunobrise/linepeek) using the `OVSX_PAT`.
5. **GitHub Release**: Creates a new GitHub Release with the generated `.vsix` attached.

## Troubleshooting

### CI Test Failures

If the CI fails at the "Run tests" step with a `SIGSEGV` or `Display server` error, ensure that `xvfb-run` is being used in the workflow file.

### 403 Forbidden on GitHub Release

If the CI fails to create the GitHub Release, verify that the `permissions` block in `.github/workflows/publish.yml` includes `contents: write`.

### Missing VSIX in Release

Ensure that `npm run package` (which runs `vsce package`) is successful before the GitHub Release step in the CI.
