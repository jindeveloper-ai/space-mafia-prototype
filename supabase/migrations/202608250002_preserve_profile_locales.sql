begin;

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
    case
      when p_profile->>'locale' in ('ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'yue-Hant-HK', 'es-419')
        then p_profile->>'locale'
      else 'en'
    end,
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

commit;
