-- Déjà appliqué sur le projet Supabase « stats-ultimate ».

-- 1) Droits au plus juste : TRUNCATE ignore les règles RLS, TRIGGER/REFERENCES sont inutiles.
revoke truncate, trigger, references on public.app_states from authenticated, anon;

-- 2) Anti-flood : au plus une écriture par seconde et par compte (la synchro de l'appli
--    envoie au mieux toutes les 1,5 s). Code PT429 = réponse HTTP 429 « trop de requêtes ».
create or replace function public.app_states_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.updated_at > now() - interval '1 second' then
    raise exception 'too many requests' using errcode = 'PT429';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.app_states_guard() from public, anon, authenticated;

create trigger app_states_guard
  before insert or update on public.app_states
  for each row execute function public.app_states_guard();

-- 3) Droit à l'effacement (RGPD) : l'utilisateur supprime lui-même son compte.
--    SECURITY DEFINER car auth.users n'est pas accessible aux utilisateurs ; la fonction
--    ne supprime QUE le compte de l'appelant (auth.uid()). Ses données partent en cascade.
--    (L'alerte « SECURITY DEFINER exécutable » du conseiller Supabase est donc attendue.)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
