-- =============================================================================
-- AUPYGO — Supprimer la surface Storage « avatars » (non utilisée par l'app)
--
-- 1) Exécuter CE fichier dans Supabase → SQL Editor → Run
-- 2) Puis supprimer le bucket via Dashboard :
--      Storage → avatars → ⋮ → Delete bucket
--    (les DELETE SQL sur storage.objects / storage.buckets sont bloqués par
--     Supabase : ERROR 42501 protect_delete)
--
-- Vérifs après :
--   select id from storage.buckets where id = 'avatars';          -- 0 ligne
--   select policyname from pg_policies
--     where schemaname = 'storage' and tablename = 'objects'
--       and policyname ilike '%avatar%';                       -- 0 ligne
-- =============================================================================

drop policy if exists "Avatar images are publicly accessible 1oj01fe_0" on storage.objects;
drop policy if exists "Users can update/delete their own avatar 1oj01fe_0" on storage.objects;
drop policy if exists "Users can update/delete their own avatar 1oj01fe_1" on storage.objects;
drop policy if exists "Users can update/delete their own avatar 1oj01fe_2" on storage.objects;
drop policy if exists "Users can upload their own avatar 1oj01fe_0" on storage.objects;

-- Si d'autres noms de policies existent encore :
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%avatar%'
        or qual::text ilike '%avatars%'
        or with_check::text ilike '%avatars%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Fin SQL. Supprimer ensuite le bucket dans le Dashboard (Storage → avatars → Delete).
