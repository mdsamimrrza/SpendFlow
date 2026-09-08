import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from '@/utils/supabase';

export const RECEIPT_BUCKET = 'receipts';

// Must stay in sync with the bucket's allowed_mime_types / file_size_limit
// configured in supabase/migrations/20260908000000_security_hardening.sql.
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MiB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// Extension allowlist — the client-supplied filename is never trusted verbatim
// (a crafted name like "shell.php.jpg" or ".." must never reach the path).
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

// Signed URLs live for one hour — long enough for a browsing session, short
// enough that a leaked link stops working quickly. Re-resolved on demand.
const SIGNED_URL_EXPIRY_SECONDS = 3600;

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  // Remove possible data URL prefix (e.g. data:image/jpeg;base64,)
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function sanitizeExtension(fileName?: string | null, mimeType?: string | null): string {
  const raw = fileName?.split('.').pop()?.toLowerCase() ?? '';
  if (raw && ALLOWED_EXTENSIONS.has(raw)) return raw === 'jpeg' ? 'jpg' : raw;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

/**
 * Extracts the storage object path from whatever is persisted in
 * `expenses.receipt_image_url`. Handles both legacy rows (full public URLs
 * written before the bucket became private) and new rows (raw
 * `<userId>/<file>` paths). Returns null for local device URIs (file://,
 * content://, data:, blob:) and non-receipt remote URLs, which cannot be
 * managed or re-signed.
 */
export function extractReceiptPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (/^(file|content|data|blob):/i.test(stored)) return null;

  if (/^https?:\/\//i.test(stored)) {
    // Legacy public URL shape: .../storage/v1/object/[public/]<bucket>/<path>
    const marker = '/object/';
    const idx = stored.indexOf(marker);
    if (idx < 0) return null;
    const rest = stored.slice(idx + marker.length).replace(/^public\//, '');
    const [bucket, ...segments] = rest.split('/');
    if (bucket !== RECEIPT_BUCKET || segments.length === 0) return null;
    const path = segments.join('/');
    return path.includes('..') ? null : path;
  }

  // Raw storage path: <userId>/<timestamp>-<random>.<ext>
  if (stored.includes('/') && !stored.includes('..') && !stored.startsWith('/')) {
    return stored;
  }
  return null;
}

/**
 * Resolves whatever is stored in `receipt_image_url` into a URL an <Image>
 * can render. Receipts live in a PRIVATE bucket, so storage paths and legacy
 * public URLs are converted to owner-scoped signed URLs. Local device URIs
 * (offline fallback attachments) and anything unresolvable are returned as-is.
 */
export async function resolveReceiptUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  const path = extractReceiptPath(stored);
  if (!path) return stored;

  try {
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // Fall through to the raw value below.
  }
  return stored;
}

/**
 * Best-effort deletion of the storage object behind a stored receipt value.
 * Never throws — orphan cleanup must not break the caller's flow.
 */
export async function deleteReceipt(stored: string | null | undefined): Promise<void> {
  const path = extractReceiptPath(stored);
  if (!path) return;
  try {
    await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
  } catch {
    // Ignore — the object may already be gone.
  }
}

/**
 * Removes every object under the user's receipts folder (used on account
 * deletion). Best-effort: failures are swallowed so the wipe flow continues.
 */
export async function deleteUserReceipts(userId: string): Promise<void> {
  try {
    // Storage list() returns at most 100 objects per call — paginate until the
    // folder is exhausted so cleanup never silently stops after batch one.
    for (let page = 0; page < 50; page++) {
      const { data } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .list(userId, { limit: 100, offset: page * 100 });
      const files = (data ?? []).map((item) => `${userId}/${item.name}`);
      if (files.length === 0) return;
      await supabase.storage.from(RECEIPT_BUCKET).remove(files);
      if (files.length < 100) return;
    }
  } catch {
    // Ignore — storage cleanup is best-effort during account deletion.
  }
}

export async function uploadReceipt(
  userId: string,
  uri: string,
  fileName?: string | null,
  mimeType?: string | null,
  base64Data?: string | null,
): Promise<string> {
  // MIME allowlist — never trust the picker-provided type blindly, and reject
  // anything the bucket would refuse so the user gets a clear error.
  const normalizedMime = mimeType?.toLowerCase().split(';')[0] ?? null;
  if (normalizedMime && !ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new Error('Receipts can only be images (JPEG, PNG, WebP or HEIC).');
  }

  // Size cap — mirror the bucket limit client-side for a fast, clear failure.
  // For base64 inputs the decoded length is known up front; for local files
  // the check runs after the read below (10 MiB of base64 stays well within
  // memory limits).
  if (base64Data) {
    const encoded = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    if (Math.floor(encoded.length * 0.75) > MAX_RECEIPT_BYTES) {
      throw new Error('Receipt image is too large (max 10 MB).');
    }
  }

  const extension = sanitizeExtension(fileName, normalizedMime);
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const contentType = normalizedMime || (extension === 'png' ? 'image/png' : 'image/jpeg');

  let fileData: ArrayBuffer | Blob;

  if (base64Data) {
    // 1. If base64 is already provided by ImagePicker, use it directly
    fileData = decodeBase64ToArrayBuffer(base64Data);
  } else if (Platform.OS === 'web') {
    // 2. Web browser: fetch blob
    const response = await fetch(uri);
    fileData = await response.blob();
    if (fileData instanceof Blob && fileData.size > MAX_RECEIPT_BYTES) {
      throw new Error('Receipt image is too large (max 10 MB).');
    }
  } else {
    // 3. Android / iOS: Read local file URI using expo-file-system
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    if (Math.floor(base64.length * 0.75) > MAX_RECEIPT_BYTES) {
      throw new Error('Receipt image is too large (max 10 MB).');
    }
    fileData = decodeBase64ToArrayBuffer(base64);
  }

  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, fileData, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Store the raw storage PATH (not a URL). The receipts bucket is private —
  // display time converts the path to a short-lived signed URL via
  // resolveReceiptUrl.
  return path;
}
