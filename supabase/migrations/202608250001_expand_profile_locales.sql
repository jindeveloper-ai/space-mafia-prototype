begin;

do $$
declare
  locale_constraint record;
begin
  for locale_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    join pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace as schema_row on schema_row.oid = table_row.relnamespace
    join pg_attribute as column_row
      on column_row.attrelid = table_row.oid
      and column_row.attname = 'locale'
    where schema_row.nspname = 'public'
      and table_row.relname = 'profiles'
      and constraint_row.contype = 'c'
      and constraint_row.conkey = array[column_row.attnum]
  loop
    execute format('alter table public.profiles drop constraint %I', locale_constraint.conname);
  end loop;
end
$$;

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'yue-Hant-HK', 'es-419'))
  not valid;

alter table public.profiles validate constraint profiles_locale_check;

commit;
