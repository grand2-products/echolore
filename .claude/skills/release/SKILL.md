---
name: release
description: Create a versioned release by tagging and pushing to trigger the publish-release GitHub Actions workflow. Use this skill whenever the user says "release", "deploy", "ship it", "tag a new version", or anything about publishing a new version of the application. Also trigger when the user uses /release.
---

# Release

Create a new release of echolore. This tags the current main branch and pushes the tag to trigger the `publish-release.yml` GitHub Actions workflow, which builds Docker images, pushes them to GHCR, and creates a GitHub Release.

## Steps

### 1. Sync main

```bash
git checkout main
git pull
```

If there are uncommitted changes, warn the user and stop — don't proceed with a dirty working tree.

### 2. Determine the next version

Find the latest semver tag:

```bash
git tag -l 'v*' --sort=-v:refname | head -1
```

- **Default (no argument)**: increment the patch version. `v0.1.16` → `v0.1.17`
- **User specifies a version** (e.g., `/release v0.2.0` or `/release minor`):
  - Exact tag like `v0.2.0` — use as-is
  - `patch` — increment patch (same as default)
  - `minor` — increment minor, reset patch to 0. `v0.1.16` → `v0.2.0`
  - `major` — increment major, reset minor and patch. `v0.1.16` → `v1.0.0`

### 3. Show what will be released

```bash
git log --oneline <latest-tag>..HEAD
```

Print the commit list and the version that will be created, e.g.:

> Releasing **v0.1.17** (3 commits since v0.1.16)

If there are no new commits since the last tag, tell the user there is nothing to release and stop.

### 4. Tag and push

No confirmation needed — go straight ahead.

```bash
git tag <new-version>
git push origin <new-version>
```

### 5. Monitor the workflow

Find the triggered run and watch it:

```bash
gh run list --workflow=publish-release.yml --limit=1
gh run watch <run-id> --exit-status
```

If the watch command produces very long output, check the final status with:

```bash
gh run view <run-id> --json status,conclusion,jobs \
  --jq '{status: .status, conclusion: .conclusion, jobs: [.jobs[] | {name: .name, conclusion: .conclusion}]}'
```

### 6. Report the result

On success, show the release URL:

```bash
gh release view <new-version> --json tagName,url --jq '.url'
```

Print a summary like:

> **v0.1.17** released successfully.
> https://github.com/grand2-products/echolore/releases/tag/v0.1.17

On failure, show which job failed and its logs so the user can diagnose the issue.
