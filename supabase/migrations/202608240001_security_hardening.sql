begin;

alter table public.profiles enable row level security;
alter table public.player_state enable row level security;
alter table public.state_mutations enable row level security;
alter table public.match_history enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.player_state from anon, authenticated;
revoke all on table public.state_mutations from anon, authenticated;
revoke all on table public.match_history from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.player_state to authenticated;
grant select, insert, update, delete on table public.state_mutations to authenticated;
grant select, insert, update, delete on table public.match_history to authenticated;
grant select, insert, update, delete on table public.chat_messages to authenticated;

drop policy if exists profiles_own_rows on public.profiles;
drop policy if exists profiles_own_select on public.profiles;
drop policy if exists profiles_own_insert on public.profiles;
drop policy if exists profiles_own_update on public.profiles;
drop policy if exists profiles_own_delete on public.profiles;
create policy profiles_own_select on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy profiles_own_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy profiles_own_update on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy profiles_own_delete on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists player_state_own_rows on public.player_state;
drop policy if exists player_state_own_select on public.player_state;
drop policy if exists player_state_own_insert on public.player_state;
drop policy if exists player_state_own_update on public.player_state;
drop policy if exists player_state_own_delete on public.player_state;
create policy player_state_own_select on public.player_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy player_state_own_insert on public.player_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy player_state_own_update on public.player_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy player_state_own_delete on public.player_state for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists state_mutations_own_rows on public.state_mutations;
drop policy if exists state_mutations_own_select on public.state_mutations;
drop policy if exists state_mutations_own_insert on public.state_mutations;
drop policy if exists state_mutations_own_update on public.state_mutations;
drop policy if exists state_mutations_own_delete on public.state_mutations;
create policy state_mutations_own_select on public.state_mutations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy state_mutations_own_insert on public.state_mutations for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy state_mutations_own_update on public.state_mutations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy state_mutations_own_delete on public.state_mutations for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists match_history_own_rows on public.match_history;
drop policy if exists match_history_own_select on public.match_history;
drop policy if exists match_history_own_insert on public.match_history;
drop policy if exists match_history_own_update on public.match_history;
drop policy if exists match_history_own_delete on public.match_history;
create policy match_history_own_select on public.match_history for select to authenticated
  using ((select auth.uid()) = user_id);
create policy match_history_own_insert on public.match_history for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy match_history_own_update on public.match_history for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy match_history_own_delete on public.match_history for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists chat_messages_own_rows on public.chat_messages;
drop policy if exists chat_messages_own_select on public.chat_messages;
drop policy if exists chat_messages_own_insert on public.chat_messages;
drop policy if exists chat_messages_own_update on public.chat_messages;
drop policy if exists chat_messages_own_delete on public.chat_messages;
create policy chat_messages_own_select on public.chat_messages for select to authenticated
  using ((select auth.uid()) = user_id);
create policy chat_messages_own_insert on public.chat_messages for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy chat_messages_own_update on public.chat_messages for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy chat_messages_own_delete on public.chat_messages for delete to authenticated
  using ((select auth.uid()) = user_id);

update storage.buckets
set public = false,
    file_size_limit = 1000000,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'avatars';

drop policy if exists avatar_owner_insert on storage.objects;
create policy avatar_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$'
  );

drop policy if exists avatar_owner_update on storage.objects;
create policy avatar_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{32}\.(png|jpg|webp)$'
  );

commit;
