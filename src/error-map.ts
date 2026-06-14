export function statusToErrorType(statusCode: number): string | undefined {
  if (statusCode === 401) return "unauthorized"
  if (statusCode === 403) return "forbidden"
  if (statusCode === 404) return "not_found"
  if (statusCode === 408) return "timeout"
  if (statusCode === 429) return "rate_limited"
  if (statusCode >= 500) return "server_error"
  return undefined
}
