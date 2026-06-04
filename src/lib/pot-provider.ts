import http from "http";

/**
 * Client for the bgutil POT (Proof-of-Origin Token) provider.
 *
 * The provider PROCESS is owned by the Docker CMD (a shell loop that launches
 * it and restarts it on crash) — NOT by this Node app. Next.js bundles the
 * instrumentation hook and route handlers separately, so a provider spawned
 * from inside the app isn't reliably visible/shared across bundles. Keeping
 * lifecycle in the CMD makes "auto-restart" robust and bundle-independent.
 *
 * This module only TALKS to the provider over the raw `http` module (NOT
 * global fetch, which Next.js patches and which couldn't reach localhost).
 * Because it speaks to a fixed port, it works regardless of which bundle runs.
 */

const PORT = Number(process.env.POT_PROVIDER_PORT || 4416);
// The provider binds to "::" (IPv6) on Railway, so IPv4 127.0.0.1 is refused.
// Try IPv6 loopback first, then IPv4. Override with POT_PROVIDER_HOST.
const HOSTS = process.env.POT_PROVIDER_HOST
  ? [process.env.POT_PROVIDER_HOST]
  : ["::1", "127.0.0.1"];

function requestOnce(
  host: string,
  method: string,
  path: string,
  timeoutMs: number
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port: PORT, path, method, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function httpRequest(
  method: string,
  path: string,
  timeoutMs = 2000
): Promise<{ status: number; body: string }> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      return await requestOnce(host, method, path, timeoutMs);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface PotStatus {
  up: boolean;
  detail: string;
  version?: string;
  attempts?: Record<string, string>;
}

const DIAG_HOSTS = ["::1", "127.0.0.1", "localhost", "0.0.0.0"];

/** Ping the provider's /ping endpoint to confirm it's up (and read version). */
export async function getPotStatus(): Promise<PotStatus> {
  // Diagnostic: probe every loopback variant so we can see which one Node can
  // actually reach (yt-dlp uses 127.0.0.1 and works, but Node has been refused).
  const attempts: Record<string, string> = {};
  let up = false;
  let version: string | undefined;
  let okDetail = "";
  for (const host of DIAG_HOSTS) {
    try {
      const { status, body } = await requestOnce(host, "GET", "/ping", 2000);
      attempts[host] = `HTTP ${status}`;
      if (status >= 200 && status < 300 && !up) {
        up = true;
        okDetail = `${host} HTTP ${status}`;
        try {
          version = (JSON.parse(body) as { version?: string }).version;
        } catch {
          /* body may not be JSON */
        }
      }
    } catch (err) {
      attempts[host] = err instanceof Error ? err.message : String(err);
    }
  }
  return { up, detail: up ? okDetail : "all hosts failed", version, attempts };
}

/** Tell the provider to drop cached tokens so the next request regenerates. */
export async function invalidatePotCache(): Promise<boolean> {
  try {
    const { status } = await httpRequest("POST", "/invalidate_caches", 3000);
    console.log(`[pot] invalidate_caches -> HTTP ${status}`);
    return status >= 200 && status < 300;
  } catch (err) {
    console.error(`[pot] invalidate_caches failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
