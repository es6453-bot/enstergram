import { existsSync } from "node:fs";
export function loadLocalEnvironment() {
  if (process.env.VERCEL) return;
  for (const file of [".env.local", ".env"])
    if (existsSync(file)) process.loadEnvFile(file);
}
export function databaseOptions() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url)
    throw new Error("Set TURSO_DATABASE_URL before running database commands.");
  if (
    process.env.VERCEL &&
    (!url.startsWith("libsql://") || !process.env.TURSO_AUTH_TOKEN)
  )
    throw new Error("A remote libSQL URL and token are required on Vercel.");
  return { url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" };
}
