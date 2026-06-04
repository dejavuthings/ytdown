// Next.js instrumentation hook — runs once when the server process boots.
// We use it to start the bgutil POT provider supervisor so the token provider
// is up (and auto-restarting) regardless of which route is hit first.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPotProvider } = await import("./lib/pot-provider");
    startPotProvider();
  }
}
