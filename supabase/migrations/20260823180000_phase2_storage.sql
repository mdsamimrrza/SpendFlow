insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

create policy "receipt images are publicly readable"
on storage.objects for select
using (bucket_id = 'receipts');

create policy "users upload their own receipts"
on storage.objects for insert to authenticated
with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "users delete their own receipts"
on storage.objects for delete to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid()::text));

alter table public.expenses
	add column if not exists search_vector tsvector
	generated always as (to_tsvector('english', coalesce(description, '') || ' ' || coalesce(notes, ''))) stored;

create index if not exists expenses_search_vector_idx on public.expenses using gin (search_vector);