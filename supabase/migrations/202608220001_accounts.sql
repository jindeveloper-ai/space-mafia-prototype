begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 12),
  locale text not null default 'ko' check (locale in ('ko', 'en')),
  avatar_path text not null default '' check (char_length(avatar_path) <= 220),
  client_updated_at bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  revision bigint not null default 0 check (revision >= 0),
  progression jsonb not null default '{}'::jsonb,
  archive_visit_dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.state_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  mutation_type text not null default 'snapshot',
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create table if not exists public.match_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  round_id text not null check (char_length(round_id) between 1 and 100),
  mode text not null check (mode in ('solo', 'friend')),
  difficulty text not null check (difficulty in ('normal', 'hard')),
  role text not null check (role in ('mafia', 'citizen')),
  outcome text not null check (outcome in ('win', 'lose', 'draw')),
  evidence_target_id text,
  accused_id text,
  claim_id text,
  response_id text,
  selected_id text,
  votes jsonb not null default '[]'::jsonb,
  vote_shift_count smallint not null default 0 check (vote_shift_count between 0 and 3),
  stars smallint not null default 0 check (stars between 0 and 3),
  engine_version text not null default 'unknown' check (char_length(engine_version) <= 40),
  authoritative boolean not null default false,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, round_id)
);

create index if not exists match_history_user_played_idx
  on public.match_history (user_id, played_at desc);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id text not null check (char_length(client_message_id) between 1 and 100),
  character_id text not null check (character_id in ('mina', 'juno', 'noel')),
  sender text not null check (sender in ('player', 'character')),
  body text not null check (char_length(body) between 1 and 1000),
  model_mode text not null default 'mock' check (model_mode in ('live', 'mock')),
  reply_to_client_message_id text,
  created_at timestamptz not null default now(),
  unique (user_id, client_message_id)
);

create index if not exists chat_messages_user_character_created_idx
  on public.chat_messages (user_id, character_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.player_state enable row level security;
alter table public.state_mutations enable row level security;
alter table public.match_history enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists profiles_own_rows on public.profiles;
create policy profiles_own_rows on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists player_state_own_rows on public.player_state;
create policy player_state_own_rows on public.player_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists state_mutations_own_rows on public.state_mutations;
create policy state_mutations_own_rows on public.state_mutations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists match_history_own_rows on public.match_history;
create policy match_history_own_rows on public.match_history
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists chat_messages_own_rows on public.chat_messages;
create policy chat_messages_own_rows on public.chat_messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.mars_apply_player_state(
  p_base_revision bigint,
  p_mutation_id uuid,
  p_progression jsonb,
  p_archive_dates date[],
  p_profile jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_revision bigint;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.profiles (
    user_id,
    display_name,
    locale,
    avatar_path,
    client_updated_at
  ) values (
    current_user_id,
    left(coalesce(p_profile->>'name', ''), 12),
    case when p_profile->>'locale' = 'en' then 'en' else 'ko' end,
    left(coalesce(p_profile->>'avatarPath', ''), 220),
    greatest(0, coalesce((p_profile->>'updatedAt')::bigint, 0))
  )
  on conflict (user_id) do update set
    display_name = case
      when excluded.client_updated_at >= profiles.client_updated_at then excluded.display_name
      else profiles.display_name
    end,
    locale = case
      when excluded.client_updated_at >= profiles.client_updated_at then excluded.locale
      else profiles.locale
    end,
    avatar_path = case
      when excluded.client_updated_at >= profiles.client_updated_at and excluded.avatar_path <> '' then excluded.avatar_path
      else profiles.avatar_path
    end,
    client_updated_at = greatest(profiles.client_updated_at, excluded.client_updated_at),
    updated_at = now();

  insert into public.player_state (user_id, schema_version, revision, progression, archive_visit_dates)
  values (current_user_id, 1, 0, '{}'::jsonb, '{}')
  on conflict (user_id) do nothing;

  select revision into current_revision
  from public.player_state
  where user_id = current_user_id
  for update;

  if exists (
    select 1 from public.state_mutations
    where user_id = current_user_id and mutation_id = p_mutation_id
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'revision', current_revision);
  end if;

  if current_revision <> p_base_revision then
    return jsonb_build_object('ok', false, 'conflict', true, 'revision', current_revision);
  end if;

  update public.player_state set
    schema_version = 1,
    revision = revision + 1,
    progression = coalesce(p_progression, '{}'::jsonb),
    archive_visit_dates = coalesce(p_archive_dates, '{}'),
    updated_at = now()
  where user_id = current_user_id
  returning revision into current_revision;

  insert into public.state_mutations (user_id, mutation_id, mutation_type)
  values (current_user_id, p_mutation_id, 'snapshot');

  return jsonb_build_object('ok', true, 'duplicate', false, 'revision', current_revision);
end;
$$;

grant execute on function public.mars_apply_player_state(bigint, uuid, jsonb, date[], jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1000000, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 1000000,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists avatar_owner_select on storage.objects;
create policy avatar_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatar_owner_insert on storage.objects;
create policy avatar_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatar_owner_update on storage.objects;
create policy avatar_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatar_owner_delete on storage.objects;
create policy avatar_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
