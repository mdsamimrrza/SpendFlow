// ─────────────────────────────────────────────────────────────────────────────
// Shared loader for maintenance-script secrets.
//
// Maintenance-only secrets (service-role key, provider API keys) live in
// `.env.maintenance` — NEVER in the app's `.env`, which Expo may bundle via
// EXPO_PUBLIC_* variables and which is shared with every dev machine.
// `.env.maintenance` is gitignored; each maintainer keeps their own copy.
//
// Usage (first import in a script):
//   import './load-maintenance-env';
// After that, process.env.SUPABASE_SERVICE_ROLE_KEY etc. are populated.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const candidates = ['.env.maintenance', '.env'];

for (const file of candidates) {
  try {
    const parsed = parseEnvFile(readFileSync(resolvePath(process.cwd(), file), 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      // Real environment variables always win; the file only fills gaps.
      if (!process.env[key]) process.env[key] = value;
    }
    if (file === '.env.maintenance') break; // preferred source found — stop
  } catch {
    // try the next candidate
  }
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.service_role) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.service_role;
}
