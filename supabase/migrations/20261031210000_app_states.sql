-- Déjà appliqué sur le projet Supabase « stats-ultimate ».
-- Une sauvegarde de l'état de l'appli par utilisateur (données personnelles).
create table public.app_states (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint app_states_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint app_states_data_size check (pg_column_size(data) < 5000000)
);

alter table public.app_states enable row level security;

create policy "Lecture de ses propres données" on public.app_states
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Création de ses propres données" on public.app_states
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Modification de ses propres données" on public.app_states
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Suppression de ses propres données" on public.app_states
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.app_states from anon;

-- Enregistrement avec contrôle de version : erreur 40001 « conflict » si le cloud a changé entre-temps.
create or replace function public.save_app_state(p_data jsonb, p_base_revision bigint)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur bigint;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select s.revision into cur from public.app_states s where s.user_id = uid for update;
  if cur is null then
    insert into public.app_states (user_id, data, revision) values (uid, p_data, 1);
    return query select 1::bigint, now();
  elsif p_base_revision is distinct from cur then
    raise exception 'conflict' using errcode = '40001', detail = cur::text;
  else
    update public.app_states s set data = p_data, revision = cur + 1, updated_at = now() where s.user_id = uid;
    return query select cur + 1, now();
  end if;
end;
$$;

revoke all on function public.save_app_state(jsonb, bigint) from public, anon;
grant execute on function public.save_app_state(jsonb, bigint) to authenticated;
