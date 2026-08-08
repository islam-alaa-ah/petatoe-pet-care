-- KYUM CRM Enterprise v2.0 — Phase 17.0
-- Adds the explicit PostgREST relationship required by daily task queries.

begin;

do $$
declare
  orphan_count bigint;
begin
  select count(*)
    into orphan_count
  from public.daily_task_completions c
  left join public.user_profiles p on p.id = c.user_id
  where p.id is null;

  if orphan_count > 0 then
    raise exception
      'Cannot create daily task user-profile relationship: % completion row(s) have no matching public.user_profiles row.',
      orphan_count;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_task_completions_user_profile_fkey'
      and conrelid = 'public.daily_task_completions'::regclass
  ) then
    alter table public.daily_task_completions
      add constraint daily_task_completions_user_profile_fkey
      foreign key (user_id)
      references public.user_profiles(id)
      on delete cascade
      not valid;
  end if;
end
$$;

alter table public.daily_task_completions
  validate constraint daily_task_completions_user_profile_fkey;

commit;

notify pgrst, 'reload schema';
