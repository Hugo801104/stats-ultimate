-- Déjà appliqué sur le projet Supabase « stats-ultimate ».
-- La partie à droits élevés de la suppression de compte passe dans un schéma NON exposé par l'API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Double vérification : on ne peut supprimer que soi-même.
  if target is null or target is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from auth.users where id = target;
end;
$$;

revoke all on function private.delete_user(uuid) from public, anon;
grant execute on function private.delete_user(uuid) to authenticated;

-- Point d'entrée public, SANS droits particuliers (security invoker).
create or replace function public.delete_my_account()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform private.delete_user(uid);
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
