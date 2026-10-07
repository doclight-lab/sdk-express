# Repository instructions

- Package: `@doclight/express` (pnpm). Validate with `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm validate:consumer`, `node --test .github/scripts/*.test.cjs`.
- **Conventional Commits**: every PR title must be a Conventional Commit (`feat:`, `fix:`, `perf:`, `docs:`, `chore:` ...; `feat!:` or a `BREAKING CHANGE:` footer for breaking changes). PRs are **squash merged**, so the PR title becomes the commit Release Please reads.
- Do not hand-edit `package.json` version, `CHANGELOG.md` release sections or `.release-please-manifest.json`; the Release Please PR owns them.
- `.github/workflows/*` and controller scripts are protected automation paths; changes need a trusted maintainer.
- Middleware must never alter responses, consume bodies, break error-handler arity, or wait on telemetry delivery. Never record credentials, cookies, bodies or raw IPs.
- Release process: see `docs/RELEASE.md`.
