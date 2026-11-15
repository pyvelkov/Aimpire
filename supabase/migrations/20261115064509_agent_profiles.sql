-- Persistent department identities for the six AI World characters.
-- Not applied automatically. Review this file, then run it in the Supabase
-- SQL editor or with the Supabase CLI. The application does not run it.
--
-- These rows name the existing departments. They do not own agent_tasks,
-- and they do not store execution history. Progression columns are
-- intentionally omitted until a later stage.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null,
  display_name text not null,
  description text not null,
  responsibilities text not null,
  specialization text not null,
  avatar_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_profiles_agent_type_key unique (agent_type),
  constraint agent_profiles_avatar_id_key unique (avatar_id),
  constraint agent_profiles_agent_type_check check (
    agent_type in (
      'research',
      'product',
      'marketing',
      'finance',
      'operations',
      'support'
    )
  ),
  constraint agent_profiles_avatar_id_check check (
    avatar_id in ('nova', 'quinn', 'rio', 'jules', 'sage', 'wynn')
  ),
  constraint agent_profiles_text_not_blank check (
    length(btrim(display_name)) > 0
    and length(btrim(description)) > 0
    and length(btrim(responsibilities)) > 0
    and length(btrim(specialization)) > 0
  )
);

comment on table public.agent_profiles is
  'Character identity for one department. Task history stays on the existing agent_tasks.agent_type value. Progression columns are intentionally absent.';

comment on column public.agent_profiles.agent_type is
  'Department key shared with agent_tasks.agent_type. A profile does not own or assign tasks.';

comment on column public.agent_profiles.avatar_id is
  'Sprite id painted in AI World. Not an image URL.';

create or replace function private.touch_agent_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function private.touch_agent_profile_updated_at() is
  'Keeps agent_profiles.updated_at current. Browser roles cannot execute it.';

revoke all on function private.touch_agent_profile_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists agent_profiles_set_updated_at on public.agent_profiles;
create trigger agent_profiles_set_updated_at
before update on public.agent_profiles
for each row execute function private.touch_agent_profile_updated_at();

alter table public.agent_profiles enable row level security;

-- Default privileges may grant browser roles access to a new public table.
-- Revoke those grants. No anon or authenticated policy is created, so RLS
-- denies those roles. The agent service reads with the service role.
revoke all on table public.agent_profiles from public, anon, authenticated, service_role;
grant select on table public.agent_profiles to service_role;

insert into public.agent_profiles (
  agent_type,
  display_name,
  description,
  responsibilities,
  specialization,
  avatar_id
) values
  (
    'research',
    'Nova',
    'Nova sits at the research desk and reads the evidence headquarters has saved.',
    'Study markets, products, and suppliers, and keep that work on research tasks.',
    'Market and supplier research',
    'nova'
  ),
  (
    'product',
    'Quinn',
    'Quinn keeps the product desk, where candidates are compared before anyone acts on them.',
    'Turn research into product tasks and keep product work traceable.',
    'Product evaluation',
    'quinn'
  ),
  (
    'marketing',
    'Rio',
    'Rio keeps the marketing desk and the campaign board.',
    'Prepare marketing tasks for campaigns that have not been published.',
    'Campaign preparation',
    'rio'
  ),
  (
    'finance',
    'Jules',
    'Jules keeps the finance desk, the ledgers, and the locked cabinet.',
    'Record finance tasks for costs, pricing, and margins.',
    'Costs and margins',
    'jules'
  ),
  (
    'operations',
    'Sage',
    'Sage keeps the operations desk and the floor routes.',
    'Track operations tasks for routing and fulfillment work.',
    'Routing and fulfillment',
    'sage'
  ),
  (
    'support',
    'Wynn',
    'Wynn keeps the support desk and the ticket board.',
    'Keep support tasks for questions and follow-up.',
    'Customer questions',
    'wynn'
  )
on conflict (agent_type) do nothing;
