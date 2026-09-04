export function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host");
  if (!requestHost) return new URL(request.url).origin;

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.slice(0, -1);
  try {
    return new URL(`${protocol}://${requestHost}`).origin;
  } catch {
    return new URL(request.url).origin;
  }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || origin === publicOrigin(request);
}

export function isSecureRequest(request: Request) {
  return new URL(publicOrigin(request)).protocol === "https:";
}
