# First npm release gate

Local deliverables for issue #5. Items marked **Blocked** need a trusted maintainer or another repository.

## Gate checklist (record results in the release PR)
- [ ] Release commit is on `main` with green `Automation CI` (lint, typecheck, build, test, `node --test .github/scripts/*.test.cjs`).
- [ ] `pnpm validate:consumer` passes on that commit (Express 4 and 5, ESM and CJS).
- [ ] `@doclight/node@^0.1.0` (and transitive `@doclight/core`) resolve on npm: `npm view @doclight/node version` (verified 0.1.0 on 2026-10-07).
- [ ] After publish: clean install `npm i @doclight/express` in an empty dir and run the example; record the version and output.

## Blocked: workflow changes (protected paths, trusted maintainer)
- `ci.yml`: add a matrix (Node 18/20/22; add a step `pnpm validate:consumer`).
- `release.yml`: run `pnpm lint typecheck test validate:consumer` before `changesets/action` publishes, and fail if `npm view @doclight/node@<range>` does not resolve. The current workflow builds and publishes without tests.
- `package.json` `repository.url` points to `github.com/doclight/sdk-express`; the repo lives at `doclight-lab/sdk-express`. Confirm intended canonical URL before first publish.

## Blocked: marketing documentation (other repository)
https://github.com/degerahmet/aeo-visibility/issues/102 must publish the Express integration page: install, `app.use` snippet, `collect` policy, shutdown, privacy guarantees (no bodies/cookies/query/raw IPs; origin-only referrer), coverage limits. Not claimed complete here.

## Release Please migration (issue #5)
Registry state verified 2026-10-07: `npm view @doclight/express version` returns `0.1.0`; no git tags or GitHub releases exist. Release Please is therefore bootstrapped at `0.1.0` (`.release-please-manifest.json`), and the next version comes from Conventional Commits (pre-1.0: `feat` and `fix` bump patch, breaking bumps minor). The "first release = 0.1.1" rule is satisfied by a first `fix:`/`feat:` release; nothing is republished.

Added here (non-protected): `release-please-config.json`, `.release-please-manifest.json`, `CLAUDE.md` (Conventional Commit PR titles, squash merge).

**Blocked: trusted maintainer must**
1. Replace `.github/workflows/release.yml` with `docs/release-please.workflow.proposed.yml` (one workflow: Release Please, then a publish job gated on `release_created`, checking out the exact release tag, re-validating, checking `@doclight/node` on npm, idempotent `NPM_TOKEN` publish, `workflow_dispatch` recovery for an existing tag on main).
2. Then remove `.changeset/`, `@changesets/cli` and refresh the lockfile (kept for now so the current release path is not left half-migrated).
3. Ensure `PROJECTS_TOKEN` has contents + pull-requests write on this repo (needed so release PRs trigger CI/Codex; `GITHUB_TOKEN` events are suppressed) and that merge controllers treat the release PR (`release-please--branches--main`, `chore(main): release`) as eligible, still requiring all checks/reviews.
4. Confirm `NPM_TOKEN` is an Actions secret with publish rights for `@doclight/express` (and org 2FA policy allows automation tokens). Not verified by this PR.
5. Allow squash merging; fix `repository.url` (`doclight/sdk-express` vs `doclight-lab/sdk-express`).

**Failed-publish recovery:** rerun the failed job, or run the workflow manually (`workflow_dispatch`, `tag=vX.Y.Z`) from `main`; the same validation, concurrency and already-published skip apply, and no new version is created.

**Unverified:** the proposed workflow was only YAML-parsed, never run; no package was published; secrets, branch protection and PROJECTS_TOKEN scopes are unchecked.
