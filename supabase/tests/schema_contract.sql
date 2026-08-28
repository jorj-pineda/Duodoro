begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  current_setting('server_version_num')::integer between 170000 and 179999,
  'migrations run against PostgreSQL 17'
);

select has_table(
  'public'::name,
  table_name::name,
  format('table public.%I exists', table_name)
)
  from unnest(array[
    'profiles',
    'friendships',
    'tasks',
    'waitlist',
    'sessions',
    'session_participants',
    'premium_grants'
  ]) as table_name;

select has_column(
  'public'::name,
  'profiles'::name,
  column_name::name,
  format('profiles.%I exists', column_name)
)
  from unnest(array[
    'discriminator',
    'username_changed',
    'display_name_changed_at',
    'current_session_id',
    'current_world_id',
    'is_premium'
  ]) as column_name;

select has_column(
  'public'::name,
  'tasks'::name,
  'completed_by'::name,
  'tasks.completed_by exists'
);
select has_column(
  'public'::name,
  'sessions'::name,
  'recording_key'::name,
  'sessions.recording_key exists'
);

select ok(
  not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any(array[
         'profiles', 'friendships', 'tasks', 'waitlist', 'sessions',
         'session_participants', 'premium_grants'
       ])
       and not c.relrowsecurity
  ),
  'RLS is enabled on every application table'
);

select is(
  (
    select array_agg(policyname::text order by policyname)
      from pg_policies
     where schemaname = 'public'
  ),
  array[
    'friendships_accept',
    'friendships_delete',
    'friendships_insert',
    'friendships_read_own',
    'premium_grants_read_own',
    'profiles_insert_own',
    'profiles_read_known',
    'profiles_update_own',
    'sessions_read_own',
    'sp_read_own',
    'tasks_delete',
    'tasks_insert',
    'tasks_read',
    'tasks_update',
    'waitlist_insert'
  ]::text[],
  'the final RLS policy set matches the application contract'
);

select ok(
  exists (
    select 1
      from pg_constraint
     where conname = 'sessions_world_check'
       and pg_get_constraintdef(oid) like '%grocery%'
       and pg_get_constraintdef(oid) like '%lofi%'
  ),
  'the world constraint includes grocery and preserves historical lofi rows'
);

select has_index(
  'public'::name,
  'friendships'::name,
  'friendships_pair_unique'::name,
  'friendship pairs stay unique in either direction'
);
select has_index(
  'public'::name,
  'tasks'::name,
  'tasks_owner_room_idx'::name,
  'owner room task reads are indexed'
);
select has_index(
  'public'::name,
  'session_participants'::name,
  'session_participants_session_user_idx'::name,
  'session participant policy lookups are indexed'
);
select has_index(
  'public'::name,
  'sessions'::name,
  'sessions_recording_key_unique'::name,
  'focus recording idempotency keys are unique'
);

select has_function('public', 'claim_username', array['text']);
select has_function('public', 'search_profiles', array['text']);
select has_function('public', 'toggle_shared_task', array['uuid', 'boolean']);
select has_function('public', 'claim_premium', array['boolean']);
select has_function('public', 'total_focus_seconds', array['uuid']);
select has_function(
  'public',
  'record_focus_session',
  array[
    'uuid', 'text', 'text', 'integer', 'integer', 'integer', 'boolean',
    'timestamp with time zone', 'uuid[]'
  ]
);

select ok(
  not (select prosecdef from pg_proc where oid = 'public.record_focus_session(uuid,text,text,integer,integer,integer,boolean,timestamptz,uuid[])'::regprocedure),
  'record_focus_session is security invoker'
);
select is(
  (select proconfig from pg_proc where oid = 'public.record_focus_session(uuid,text,text,integer,integer,integer,boolean,timestamptz,uuid[])'::regprocedure),
  array['search_path=""']::text[],
  'record_focus_session has an empty search path'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_focus_session(uuid,text,text,integer,integer,integer,boolean,timestamptz,uuid[])',
    'EXECUTE'
  ),
  'service_role can record focus sessions'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_focus_session(uuid,text,text,integer,integer,integer,boolean,timestamptz,uuid[])',
    'EXECUTE'
  ),
  'authenticated clients cannot record focus sessions'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.search_profiles(text)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.search_profiles(text)',
    'EXECUTE'
  ),
  'profile search is authenticated-only'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.total_focus_seconds(uuid)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.total_focus_seconds(uuid)',
    'EXECUTE'
  ),
  'cross-user focus totals are service-role-only'
);

select ok(
  exists (
    select 1
      from pg_trigger
     where tgname = 'on_auth_user_created'
       and not tgisinternal
  ),
  'new auth users receive a profile through the signup trigger'
);

select is(
  (
    select array_agg(tablename::text order by tablename)
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = any(array['profiles', 'tasks', 'friendships'])
  ),
  array['friendships', 'profiles', 'tasks']::text[],
  'social and task tables are in the realtime publication'
);

select * from finish();
rollback;
