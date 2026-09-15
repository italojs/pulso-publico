/** Fail closed before a test runner or demo command can open a connection. */
export function assertLocalDisposableDatabaseUrl(value: string, purpose: "test" | "demo" | "test_demo") {
  const message = `A local disposable PostgreSQL database ending in _${purpose} is required.`;
  try {
    const url = new URL(value);
    const name = decodeURIComponent(url.pathname.slice(1));
    if (
      !["postgres:", "postgresql:"].includes(url.protocol)
      || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !new RegExp(`^[a-z][a-z0-9_]*_${purpose}$`).test(name)
      || url.search !== ""
      || url.hash !== ""
    ) throw new Error(message);
    return value;
  } catch {
    // Never include a connection URL or its credentials in diagnostics.
    throw new Error(message);
  }
}

export function isLocalDemoRecord(databaseUrl: string, externalId: string) {
  if (!/^demo-\d{3}$/.test(externalId)) return false;
  try {
    assertLocalDisposableDatabaseUrl(databaseUrl, "demo");
    return true;
  } catch {
    return false;
  }
}
