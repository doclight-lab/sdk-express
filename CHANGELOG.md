# Changelog

## Unreleased

- Middleware exposes bounded `flush()` / `shutdown()`.
- `pnpm validate:consumer`: packed-tarball consumer validation (Express 4/5, ESM/CJS); runnable example and integration skill.
- Agent-only collection by default (`express.collect`: `agents` | `all` | `none`); conservative bot User-Agent classification marked observed/untrusted.
- Exactly one event per request across finish/close/error; aborted connections are `cancelled`.
- Bounded session/agent headers, sanitized referrer origin, hardened route sanitization.
