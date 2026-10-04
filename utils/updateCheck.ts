// In-app update check for the SpendFlow APK.
// Reads the single android row from public.app_releases (public read via
// RLS, anon key - the row holds only a version, notes and an APK URL) and
// compares it with this build's version.

import Constants from 'expo-constants';

export interface AppRelease {
  latest_version: string;
  apk_url: string;
  min_version: string | null;
  notes: string | null;
}

export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

// -1 if a < b, 0 if equal, 1 if a > b. Numeric per dot-separated part;
// missing parts count as 0, so 2.0 < 2.0.1.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export async function fetchLatestRelease(): Promise<AppRelease | null> {
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (anonKey) {
      headers.apikey = anonKey;
      headers.Authorization = `Bearer ${anonKey}`;
    }
    const res = await fetch(
      `${url}/rest/v1/app_releases?platform=eq.android&select=latest_version,apk_url,min_version,notes&limit=1`,
      { headers }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as AppRelease[];
    const release = rows[0] ?? null;
    // An empty APK URL means "no release published yet".
    if (!release || !release.apk_url) return null;
    return release;
  } catch {
    return null;
  }
}
