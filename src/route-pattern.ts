export interface RouteRequest {
  path: string
  baseUrl?: string
  originalUrl?: string
  route?: { path?: unknown }
}

const NUMERIC_RE = /^\d+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_RE = /^[0-9a-f]{8,24}$/i
const PLAIN_SEG_RE = /^[A-Za-z0-9_.-]+$/
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)+$/i

function segmentIsId(seg: string): boolean {
  if (NUMERIC_RE.test(seg)) return true
  if (UUID_RE.test(seg)) return true
  if (HEX_RE.test(seg)) return true
  if (SLUG_RE.test(seg) && /\d/.test(seg)) return true
  // Long or non-plain segments are likely tokens, emails or other secrets.
  if (seg.length > 24) return true
  if (!PLAIN_SEG_RE.test(seg)) return true
  return false
}

const MAX_LEN = 200

function sanitizePath(path: string): string {
  return path
    .split("/")
    .map((seg) => (seg && segmentIsId(seg) ? ":id" : seg))
    .join("/")
}

export function normalizeRoute(req: RouteRequest): string {
  let pattern: string

  if (req.route && typeof req.route.path === "string" && req.route.path.length > 0) {
    // Router mounts: baseUrl holds concrete values, so sanitize it before prefixing.
    pattern = sanitizePath(req.baseUrl ?? "") + req.route.path
  } else {
    // originalUrl keeps the mount prefix; strip the query string so it can never leak.
    const raw = (req.originalUrl ?? req.path).split("?")[0] ?? ""
    pattern = sanitizePath(raw)
  }

  return pattern.length > MAX_LEN ? pattern.slice(0, MAX_LEN - 3) + "..." : pattern
}
