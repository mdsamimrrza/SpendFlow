-- Description: Consolidated storage limits for SpendFlow's two buckets.
-- Brings the LIVE project to the intended hardened state, because a probe
-- showed the limits in 20260908000000_security_hardening.sql were never
-- applied to this environment (a 5 MiB upload to receipts succeeded).
-- Idempotent: safe to run on environments where parts already exist.
--
-- Receipts (private financial documents):
--   - 4 MiB cap (tightened from the never-applied 10 MiB — bounds long-run
--     storage cost; client compresses at quality 0.8, typical receipts are
--     well under 2 MiB). Client cap in services/receipts.ts matches.
--   - Image-only MIME allowlist (matches the client's ALLOWED_MIME_TYPES).
--   - Owner-scoped read policy replaces any world-readable one.
--
-- Avatars (public by design — rendered via public URL on every device):
--   - 2 MiB cap + image-only MIME allowlist. Client-side checks in
--     services/auth.ts uploadAvatar match.

update storage.buckets
set public = false,
    file_size_limit = 4194304, -- 4 MiB
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]::text[]
where id = 'receipts';

drop policy if exists "receipt images are publicly readable" on storage.objects;
drop policy if exists "receipts readable by owner" on storage.objects;
create policy "receipts readable by owner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

update storage.buckets
set file_size_limit = 2097152, -- 2 MiB
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]::text[]
where id = 'avatars';
