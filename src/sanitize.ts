// Header values are client-controlled: accept only short, plain identifiers.
const SAFE_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/

export function boundedId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_ID_RE.test(value) ? value : undefined
}

const MAX_REFERRER_LENGTH = 2048

/** Origin only (scheme + host + port). Path, query, fragment and credentials are dropped. */
export function referrerOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_REFERRER_LENGTH) {
    return undefined
  }
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.origin
  } catch {
    return undefined
  }
}
