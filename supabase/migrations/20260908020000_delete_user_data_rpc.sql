-- ═══════════════════════════════════════════════════════════════════════════
-- Transactional user-data cleanup for account deletion.
--
-- public.delete_user_data(p_user_id) removes every user-owned row in ONE
-- PostgreSQL transaction, in FK-safe order (children before parents; the
-- expenses→categories / transfers→bank_accounts FKs are ON DELETE RESTRICT,
-- so those children must go first). Called only by the delete-account Edge
-- Function with the service-role key.
--
-- Storage objects and the Auth identity live in separate systems and are
-- handled by the Edge Function after this RPC succeeds (documented boundary
-- in SECURITY-NOTES.md — the flow is retry-safe rather than cross-system
-- atomic).
--
-- Idempotent: every DELETE is a no-op when the rows are already gone, so a
-- retry after partial failure simply re-runs the same transaction.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Children first (FKs into categories / bank_accounts are RESTRICT).
  delete from public.expenses              where user_id = p_user_id;
  delete from public.recurring_rules       where user_id = p_user_id;
  delete from public.transfers             where user_id = p_user_id;
  delete from public.category_budget_history where user_id = p_user_id;
  delete from public.bank_accounts         where user_id = p_user_id;
  delete from public.categories           where user_id = p_user_id;
  delete from public.user_settings_history where user_id = p_user_id;
  delete from public.device_tokens         where user_id = p_user_id;
  delete from public.notifications         where user_id = p_user_id;

  -- Profile row last (everything above also cascades from it, but the
  -- explicit delete makes the transaction's intent self-evident).
  delete from public.users                  where id = p_user_id;
end;
$$;

-- Only the service role (Edge Function) may call this. Never anon or
-- authenticated clients.
revoke execute on function public.delete_user_data(uuid) from public, anon, authenticated;
