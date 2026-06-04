import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import http from "http";

/**
 * Supervisor for the bgutil POT (Proof-of-Origin Token) provider.
 *
 * The provider is the linchpin that defeats YouTube's "Sign in to confirm
 * you're not a bot" on datacenter IPs. We spawn it as a CHILD of the Node app
 * (instead of a detached process in the Docker CMD) so we can:
 *   - know it's alive from the process handle (reliable, unlike an HTTP ping)
 *   - auto-restart it with backoff if it ever crashes
 *   - talk to it over the raw `http` module — NOT global fetch, which Next.js
 *     patches/instruments and which failed to reach localhost in practice.
 *
 * On local dev (no provider binary) this safely no-ops.
 */

const BIN = process.env.POT_PROVIDER_BIN || "node-bgutil";
const SCRIPT = process.env.POT_PROVIDER_SCRIPT || "/opt/bgutil-provider/build/main.js";
const PORT = Number(process.env.POT_PROVIDER_PORT || 4416);
const HOST = process.env.POT_PROVIDER_HOST || "127.0.0.1";

const MAX_LOG_LINES = 40;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]; // restart backoff, capped

interface PotStatus {
  enabled: boolean;
  running: boolean;
  pid: number | null;
  restarts: number;
  lastExit: string | null;
  boundAddress: string | null;
  recentLogs: string[];
}

let child: ChildProcess | null = null;
let started = false;
let stopping = false;
let restarts = 0;
let lastExit: string | null = null;
let boundAddress: string | null = null;
const recentLogs: string[] = [];

function log(line: string) {
  recentLogs.push(line);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
}

function captureBoundAddress(chunk: string) {
  // Provider logs e.g. "Started POT server (v1.3.1) on address 0.0.0.0:4416"
  const m = chunk.match(/on address\s+([^\s]+:\d+)/i);
  if (m) boundAddress = m[1];
}

function backoffFor(n: number): number {
  return BACKOFF_MS[Math.min(n, BACKOFF_MS.length - 1)];
}

function spawnProvider() {
  if (stopping) return;
  log(`[pot] spawning ${BIN} ${SCRIPT} (port ${PORT})`);
  const proc = spawn(BIN, [SCRIPT, "--port", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  child = proc;

  const onData = (buf: Buffer) => {
    const text = buf.toString();
    for (const raw of text.split("\n")) {
      const line = raw.trimEnd();
      if (!line) continue;
      captureBoundAddress(line);
      log(`[pot] ${line}`);
    }
  };
  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);

  proc.on("error", (err) => {
    log(`[pot] spawn error: ${err.message}`);
  });

  proc.on("exit", (code, signal) => {
    lastExit = `code=${code} signal=${signal ?? ""} at ${new Date().toISOString()}`;
    boundAddress = null;
    log(`[pot] exited (${lastExit})`);
    child = null;
    if (stopping) return;
    const delay = backoffFor(restarts);
    restarts++;
    log(`[pot] restarting in ${delay}ms (restart #${restarts})`);
    setTimeout(spawnProvider, delay);
  });
}

/** Start the supervisor once. Safe to call multiple times. */
export function startPotProvider(): void {
  if (started) return;
  started = true;

  if (!existsSync(SCRIPT)) {
    log(`[pot] provider script not found at ${SCRIPT} — disabled (local dev?)`);
    return;
  }
  spawnProvider();
}

export function getPotStatus(): PotStatus {
  const enabled = existsSync(SCRIPT);
  return {
    enabled,
    running: !!child && !child.killed,
    pid: child?.pid ?? null,
    restarts,
    lastExit,
    boundAddress,
    recentLogs: recentLogs.slice(-12),
  };
}

// --- HTTP helpers (raw http module, NOT Next-patched fetch) ---

function httpRequest(
  method: string,
  path: string,
  timeoutMs = 2000
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: HOST, port: PORT, path, method, timeout: timeoutMs },
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

/** Ping the provider over raw http. Best-effort liveness confirmation. */
export async function pingPot(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { status } = await httpRequest("GET", "/ping");
    return { ok: status >= 200 && status < 300, detail: `HTTP ${status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Tell the provider to drop cached tokens so the next request regenerates. */
export async function invalidatePotCache(): Promise<boolean> {
  try {
    const { status } = await httpRequest("POST", "/invalidate_caches", 3000);
    log(`[pot] invalidate_caches -> HTTP ${status}`);
    return status >= 200 && status < 300;
  } catch (err) {
    log(`[pot] invalidate_caches failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
