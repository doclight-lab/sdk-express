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
