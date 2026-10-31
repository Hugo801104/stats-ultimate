-- Déjà appliqué sur le projet Supabase « stats-ultimate ».
-- Fermé par défaut : toute FUTURE table, séquence ou fonction créée dans « public »
-- n'est plus accessible aux visiteurs non connectés (anon), ni exécutable par tous (PUBLIC).
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;
