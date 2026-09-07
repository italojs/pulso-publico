import { OfficialSourceError } from "#/server/http/retrying-fetch";

export function sourceErrorCode(error: unknown) {
  if (error instanceof OfficialSourceError) {
    if (error.status !== null) return `HTTP_${error.status}`;
    return error.retryable ? "UPSTREAM_UNAVAILABLE" : "CONTRACT_MISMATCH";
  }
  return "UNKNOWN";
}
