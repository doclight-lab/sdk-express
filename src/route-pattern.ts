export interface RouteRequest {
  path: string
  route?: { path?: unknown }
}

const NUMERIC_RE = /^\d+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_RE = /^[0-9a-f]{8,24}$/i
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)+$/i

function segmentIsId(seg: string): boolean {
  if (NUMERIC_RE.test(seg)) return true
  if (UUID_RE.test(seg)) return true
  if (HEX_RE.test(seg)) return true
  if (SLUG_RE.test(seg) && /\d/.test(seg)) return true
  return false
}

const MAX_LEN = 200

export function normalizeRoute(req: RouteRequest): string {
  let pattern: string

  if (req.route && typeof req.route.path === "string" && req.route.path.length > 0) {
    pattern = req.route.path
  } else {
    pattern = req.path
      .split("/")
      .map((seg) => (seg && segmentIsId(seg) ? ":id" : seg))
      .join("/")
  }

  return pattern.length > MAX_LEN ? pattern.slice(0, MAX_LEN - 3) + "..." : pattern
}
