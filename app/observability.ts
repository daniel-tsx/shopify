type Level = "info" | "warn" | "error";
export function log(level: Level, event: string, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) => !/token|secret|password|authorization/i.test(key)));
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), level, event, ...safe }) + "\n");
}
