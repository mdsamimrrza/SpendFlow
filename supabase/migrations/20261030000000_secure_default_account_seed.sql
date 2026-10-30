-- The seed RPC is callable by authenticated clients but runs as its owner to
-- serialize first-account creation. Bind its requested user to the JWT subject
-- before it can bypass bank_accounts RLS.
create or replace function public.seed_default_accounts_if_empty(p_user_id uuid, p_currency text)
returns setof public.bank_accounts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'SpendFlow: default accounts can only be seeded for the signed-in user'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('spendflow:seed:' || p_user_id, 0));

  if exists (
    select 1 from public.bank_accounts
    where user_id = p_user_id and deleted_at is null
  ) then
    return query
      select ba.* from public.bank_accounts ba
      where ba.user_id = p_user_id and ba.deleted_at is null
      order by ba.created_at asc;
    return;
  end if;

  insert into public.bank_accounts
    (id, user_id, name, account_type, currency, country,
     initial_balance, current_balance, color, icon, is_default,
     created_at, updated_at)
  values
    (gen_random_uuid(), p_user_id, 'Main Bank Account', 'bank', upper(p_currency),
     case upper(p_currency)
       when 'NPR' then 'NP' when 'INR' then 'IN' when 'QAR' then 'QA'
       when 'AED' then 'AE' when 'SAR' then 'SA' when 'GBP' then 'GB'
       when 'MYR' then 'MY' when 'KRW' then 'KR' when 'JPY' then 'JP'
       when 'AUD' then 'AU' when 'CAD' then 'CA' else null end,
     0, 0, '#10B981', 'landmark', true, now(), now()),
    (gen_random_uuid(), p_user_id, 'Cash Wallet', 'cash', upper(p_currency),
     case upper(p_currency)
       when 'NPR' then 'NP' when 'INR' then 'IN' when 'QAR' then 'QA'
       when 'AED' then 'AE' when 'SAR' then 'SA' when 'GBP' then 'GB'
       when 'MYR' then 'MY' when 'KRW' then 'KR' when 'JPY' then 'JP'
       when 'AUD' then 'AU' when 'CAD' then 'CA' else null end,
     0, 0, '#10B981', 'banknote', false, now(), now());

  return query
    select ba.* from public.bank_accounts ba
    where ba.user_id = p_user_id and ba.deleted_at is null
    order by ba.created_at asc;
end;
$$;

revoke all on function public.seed_default_accounts_if_empty(uuid, text) from public, anon;
grant execute on function public.seed_default_accounts_if_empty(uuid, text) to authenticated;
