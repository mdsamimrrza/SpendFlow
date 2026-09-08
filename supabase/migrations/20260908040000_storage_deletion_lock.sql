-- ═══════════════════════════════════════════════════════════════════════════
-- Storage write-lock during account deletion (round 4)
--
-- Gap being closed: users.deletion_pending (round 3) blocks DATABASE writes
-- via triggers, but storage INSERT/UPDATE policies only checked folder
-- ownership — a concurrent device could still upload receipts/avatars while
-- the deletion was purging, forcing reliance on the final sweep.
--
-- Fix: every client-writable storage policy (INSERT + UPDATE on receipts and
-- avatars) now ALSO requires the uploader's users.deletion_pending = false.
-- Evaluation is safe:
--   * the policy runs on storage.objects; the subselect reads public.users,
--     a different table — no recursive RLS evaluation;
--   * public.users RLS (auth.uid() = id) means the subselect can only ever
--     see the CALLER's own row, so it cannot leak or be influenced by other
--     users' deletion states;
--   * auth.uid() is wrapped in a subselect ((select auth.uid()::text)) per
--     the existing policy convention so the planner treats it as an initplan.
--
-- NOT touched by this migration (verified intentionally):
--   * SELECT policies — reading own receipts/avatars during deletion is
--     harmless and must keep working for signed-in sessions.
--   * DELETE policies — owner-folder-scoped; the Edge Function purge runs as
--     service_role (bypasses RLS entirely), and an owner deleting their own
--     objects mid-deletion only helps the purge.
--   * Service-role behavior — RLS is bypassed for service_role, so the Edge
--     Function's list/remove during deletion_pending is unaffected.
--
-- Idempotent: drop-if-exists before each create.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Receipts: INSERT blocked while the uploader's account deletion is pending
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "users upload their own receipts" on storage.objects;
create policy "users upload their own receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and not exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.deletion_pending = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Receipts: no UPDATE policy exists (none is needed — receipts are immutable
-- files; replacement is upload-new + delete-old). Nothing to lock.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Avatars: INSERT + UPDATE blocked while deletion is pending
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "users upload their own avatar" on storage.objects;
create policy "users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and not exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.deletion_pending = true
    )
  );

drop policy if exists "users update their own avatar" on storage.objects;
create policy "users update their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and not exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.deletion_pending = true
    )
  );
