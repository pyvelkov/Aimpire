-- Stage 7.2.1. Review before applying.
-- Adds task-specific claim leases and a private execution-policy store.
-- Does not claim, update, or execute any existing task.
--
-- Privilege model, checked against this database before the migration is applied:
-- postgres is not superuser and is not a member of service_role.
-- service_role is not superuser, has bypassrls, and cannot set session_user.
-- authenticator is a member of anon, authenticated, and service_role.
-- The Data API sets the JWT role, so anon does not inherit service_role execute.
-- New functions revoke the PostgreSQL PUBLIC execute default.
-- After apply, public.claim_agent_task_by_id and
-- public.read_agent_task_execution_policies should show an ACL of only
-- postgres and service_role. Settlement functions stay owner-only.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

alter table public.agent_tasks
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz;

comment on column public.agent_tasks.claim_token is
  'Token returned by claim_agent_task_by_id. claim_next_agent_task does not set it.';

comment on column public.agent_tasks.lease_expires_at is
  'End of an autonomous claim lease. Null means the row has no autonomous lease.';

create index if not exists agent_tasks_active_lease_idx
  on public.agent_tasks (lease_expires_at)
  where status = 'in_progress' and claim_token is not null;

create or replace function private.execution_capabilities_are_valid(p_capabilities text[])
returns boolean
language sql
immutable
set search_path = pg_catalog, private
as $$
  select p_capabilities is not null
    and p_capabilities <@ array[
      'research_read',
      'database_read',
      'database_write_internal',
      'supplier_external_read',
      'customer_communication',
      'storefront_publish',
      'supplier_purchase',
      'advertising_spend'
    ]::text[]
    and (
      select count(*) from unnest(p_capabilities) as capability
    ) = (
      select count(distinct capability) from unnest(p_capabilities) as capability
    );
$$;

alter function private.execution_capabilities_are_valid(text[]) owner to postgres;
revoke all on function private.execution_capabilities_are_valid(text[]) from public, anon, authenticated, service_role;

create table if not exists private.agent_task_execution_policies (
  task_id uuid primary key references public.agent_tasks(id),
  capabilities text[] not null,
  created_at timestamptz not null default now(),
  constraint agent_task_execution_policies_capabilities_valid
    check (private.execution_capabilities_are_valid(capabilities))
);

comment on table private.agent_task_execution_policies is
  'Explicit capability allowlist for one task. Missing rows grant nothing. Task text cannot write a row.';

alter table private.agent_task_execution_policies enable row level security;
alter table private.agent_task_execution_policies force row level security;
revoke all on table private.agent_task_execution_policies from public, anon, authenticated, service_role;

-- FORCE ROW LEVEL SECURITY applies to the table owner. postgres is not a
-- superuser on this project, so admin writes need policies and cannot depend
-- on a SELECT-only policy. supabase_admin is a superuser and bypasses RLS;
-- the policies still name it so the admin path stays explicit.
-- service_role, anon, and authenticated are not policy roles. service_role
-- also has no table privileges, and the session_user trigger rejects its writes.
drop policy if exists execution_policy_postgres_read on private.agent_task_execution_policies;
drop policy if exists execution_policy_admin_select on private.agent_task_execution_policies;
drop policy if exists execution_policy_admin_insert on private.agent_task_execution_policies;
drop policy if exists execution_policy_admin_update on private.agent_task_execution_policies;
drop policy if exists execution_policy_admin_delete on private.agent_task_execution_policies;

create policy execution_policy_admin_select
  on private.agent_task_execution_policies
  for select
  to postgres, supabase_admin
  using (true);

create policy execution_policy_admin_insert
  on private.agent_task_execution_policies
  for insert
  to postgres, supabase_admin
  with check (true);

create policy execution_policy_admin_update
  on private.agent_task_execution_policies
  for update
  to postgres, supabase_admin
  using (true)
  with check (true);

create policy execution_policy_admin_delete
  on private.agent_task_execution_policies
  for delete
  to postgres, supabase_admin
  using (true);

create or replace function private.reject_unmanaged_execution_policy_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
begin
  -- session_user stays the login role inside a security definer function.
  -- current_user would be postgres there, so it must not be the write check.
  if session_user::text in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'execution policies cannot be modified by the application'
    using errcode = '42501';
end;
$$;

alter function private.reject_unmanaged_execution_policy_write() owner to postgres;
revoke all on function private.reject_unmanaged_execution_policy_write() from public, anon, authenticated, service_role;

drop trigger if exists execution_policy_writes_locked on private.agent_task_execution_policies;
create trigger execution_policy_writes_locked
before insert or update or delete on private.agent_task_execution_policies
for each row execute function private.reject_unmanaged_execution_policy_write();

create or replace function private.clear_legacy_claim_lease()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.status = 'in_progress'
     and old.status is distinct from 'in_progress'
     and new.claim_token is not distinct from old.claim_token then
    new.claim_token := null;
    new.lease_expires_at := null;
  end if;
  return new;
end;
$$;

alter function private.clear_legacy_claim_lease() owner to postgres;
revoke all on function private.clear_legacy_claim_lease() from public, anon, authenticated, service_role;

drop trigger if exists agent_tasks_clear_legacy_claim_lease on public.agent_tasks;
create trigger agent_tasks_clear_legacy_claim_lease
before update on public.agent_tasks
for each row execute function private.clear_legacy_claim_lease();

create or replace function private.consequential_task_action(
  p_title text,
  p_description text,
  p_input jsonb
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, private
as $$
declare
  v_text text;
  v_requested text;
begin
  if p_input is not null and jsonb_typeof(p_input) = 'object' then
    if coalesce(p_input->>'purchase', '') = 'true' or coalesce(p_input->>'place_order', '') = 'true' then
      return 'purchasing';
    end if;
    if coalesce(p_input->>'publish', '') = 'true' then
      return 'publishing';
    end if;
    if coalesce(p_input->>'advertise', '') = 'true'
       or coalesce(p_input->>'launch_campaign', '') = 'true'
       or coalesce(p_input->>'spend', '') = 'true' then
      return 'advertising';
    end if;
    v_requested := coalesce(p_input->>'action', p_input->>'requested_action', '');
  else
    v_requested := '';
  end if;

  v_text := concat_ws(E'\n', coalesce(p_title, ''), coalesce(p_description, ''), coalesce(v_requested, ''), coalesce(p_input::text, ''));

  if v_text ~* '\y(purchase|purchasing|buy|buying|checkout|place an order|order inventory|pay the supplier|pay supplier)\y' then
    return 'purchasing';
  end if;
  if v_text ~* '\y(launch|start|run|create|buy|place|spend)\y(?:\s+\w+){0,4}\s+\y(ad|ads|advertisement|advertising|campaign)s?\y' then
    return 'advertising';
  end if;
  if v_text ~* '\y(ad spend|advertising spend|spend on ads|boost post)\y' then
    return 'advertising';
  end if;
  if v_text ~* '\yadvertising\y' then
    return 'advertising';
  end if;
  if v_text ~* '\y(publish|publishing|unpublish|shopify|go live)\y' then
    return 'publishing';
  end if;
  if v_text ~* '\y(refund customers|charge the customer|send (an )?email|email customers|post to (instagram|facebook|tiktok|the store))\y' then
    return 'external_write';
  end if;
  return null;
end;
$$;

alter function private.consequential_task_action(text, text, jsonb) owner to postgres;
revoke all on function private.consequential_task_action(text, text, jsonb) from public, anon, authenticated, service_role;

create or replace function private.scan_task_dependencies(
  p_task_id uuid,
  p_input jsonb,
  p_stack uuid[],
  out refusal text,
  out ids uuid[]
)
language plpgsql
stable
set search_path = pg_catalog, private, public
as $$
declare
  v_key text;
  v_value jsonb;
  v_element jsonb;
  v_text text;
  v_dependency uuid;
  v_child public.agent_tasks%rowtype;
  v_nested_refusal text;
  v_nested_ids uuid[];
begin
  refusal := null;
  ids := '{}'::uuid[];

  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' then
    return;
  end if;

  for v_key, v_value in
    select item.key, item.value
    from jsonb_each(p_input) as item(key, value)
  loop
    continue when v_key not in ('depends_on', 'dependencies', 'blocked_by', 'prerequisite_task_ids');

    if jsonb_typeof(v_value) is distinct from 'array' then
      refusal := 'dependency_unsatisfied';
      ids := '{}'::uuid[];
      return;
    end if;

    for v_element in
      select element.value
      from jsonb_array_elements(v_value) as element(value)
    loop
      if jsonb_typeof(v_element) is distinct from 'string' then
        refusal := 'dependency_unsatisfied';
        ids := '{}'::uuid[];
        return;
      end if;

      v_text := v_element #>> '{}';
      if v_text is null
         or v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        refusal := 'dependency_unsatisfied';
        ids := '{}'::uuid[];
        return;
      end if;

      v_dependency := v_text::uuid;
      if v_dependency = any (p_stack) then
        refusal := 'dependency_cycle';
        ids := '{}'::uuid[];
        return;
      end if;

      select * into v_child from public.agent_tasks where id = v_dependency;
      if not found or v_child.status is distinct from 'completed' then
        refusal := 'dependency_unsatisfied';
        ids := '{}'::uuid[];
        return;
      end if;

      ids := ids || v_dependency;
      select nested.refusal, nested.ids
      into v_nested_refusal, v_nested_ids
      from private.scan_task_dependencies(v_dependency, v_child.input, p_stack || v_dependency) as nested;
      if v_nested_refusal is not null then
        refusal := v_nested_refusal;
        ids := '{}'::uuid[];
        return;
      end if;
      ids := ids || coalesce(v_nested_ids, '{}'::uuid[]);
    end loop;
  end loop;
end;
$$;

alter function private.scan_task_dependencies(uuid, jsonb, uuid[]) owner to postgres;
revoke all on function private.scan_task_dependencies(uuid, jsonb, uuid[]) from public, anon, authenticated, service_role;

create or replace function private.locked_task_claim_refusal(p_task public.agent_tasks)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_action text;
  v_dependency_ids uuid[];
  v_locked_ids uuid[];
  v_refusal text;
  v_request_id uuid;
  v_request_text text;
  v_approval_status text;
  v_requested_action text;
  v_requires boolean;
  v_input_status text;
begin
  v_action := private.consequential_task_action(p_task.title, p_task.description, p_task.input);
  if v_action is not null then
    return 'externally_consequential:' || v_action;
  end if;

  if p_task.input is not null and jsonb_typeof(p_task.input) = 'object' then
    v_requires := coalesce(p_task.input->>'requires_approval', '') = 'true'
      or coalesce(p_task.input->>'approval_required', '') = 'true';
    v_input_status := lower(btrim(coalesce(p_task.input->>'approval_status', '')));
    v_request_text := nullif(btrim(coalesce(p_task.input->>'approval_request_id', p_task.input->>'approval_id', '')), '');
  else
    v_requires := false;
    v_input_status := '';
    v_request_text := null;
  end if;

  if v_input_status <> '' and v_input_status <> 'approved' then
    return 'approval_unresolved';
  end if;

  if v_request_text is not null then
    if v_request_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'approval_unresolved';
    end if;
    v_request_id := v_request_text::uuid;
    select request.status, request.requested_action
    into v_approval_status, v_requested_action
    from public.approval_requests as request
    where request.id = v_request_id
    for share;
    if not found or v_approval_status is distinct from 'approved' then
      return 'approval_unresolved';
    end if;
    if v_requested_action = 'product_review' or v_requires then
      return 'approval_does_not_authorize_execution';
    end if;
  elsif v_requires then
    return 'approval_unresolved';
  end if;

  select scanned.refusal, scanned.ids
  into v_refusal, v_dependency_ids
  from private.scan_task_dependencies(p_task.id, p_task.input, array[p_task.id]) as scanned;
  if v_refusal is not null then
    return v_refusal;
  end if;

  if cardinality(v_dependency_ids) > 0 then
    v_locked_ids := v_dependency_ids;
    perform task.id
    from public.agent_tasks as task
    where task.id = any (v_locked_ids)
    order by task.id
    for share;

    select scanned.refusal, scanned.ids
    into v_refusal, v_dependency_ids
    from private.scan_task_dependencies(p_task.id, p_task.input, array[p_task.id]) as scanned;
    if v_refusal is not null then
      return v_refusal;
    end if;
    if exists (
      select 1
      from unnest(coalesce(v_dependency_ids, '{}'::uuid[])) as discovered(id)
      where not discovered.id = any (coalesce(v_locked_ids, '{}'::uuid[]))
    ) then
      return 'dependency_unsatisfied';
    end if;
  end if;

  return null;
end;
$$;

alter function private.locked_task_claim_refusal(public.agent_tasks) owner to postgres;
revoke all on function private.locked_task_claim_refusal(public.agent_tasks) from public, anon, authenticated, service_role;

create or replace function private.read_agent_task_execution_policies(p_task_ids uuid[])
returns table (
  task_id uuid,
  capabilities text[]
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select policy.task_id, policy.capabilities
  from private.agent_task_execution_policies as policy
  where p_task_ids is not null
    and cardinality(p_task_ids) <= 200
    and policy.task_id = any(p_task_ids);
$$;

alter function private.read_agent_task_execution_policies(uuid[]) owner to postgres;
revoke all on function private.read_agent_task_execution_policies(uuid[]) from public, anon, authenticated;
grant execute on function private.read_agent_task_execution_policies(uuid[]) to service_role;

create or replace function public.read_agent_task_execution_policies(p_task_ids uuid[])
returns table (
  task_id uuid,
  capabilities text[]
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select task_id, capabilities
  from private.read_agent_task_execution_policies(p_task_ids);
$$;

revoke all on function public.read_agent_task_execution_policies(uuid[]) from public, anon, authenticated;
grant execute on function public.read_agent_task_execution_policies(uuid[]) to service_role;

create or replace function private.claim_agent_task_by_id(
  p_task_id uuid,
  p_agent_type text,
  p_lease_seconds integer
)
returns table (
  outcome text,
  task_id uuid,
  claim_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_task public.agent_tasks%rowtype;
  v_capabilities text[];
  v_token uuid;
  v_expires timestamptz;
  v_refusal text;
  v_supported text[] := array['research', 'product', 'marketing', 'finance', 'operations', 'support'];
  v_known text[] := array[
    'research_read',
    'database_read',
    'database_write_internal',
    'supplier_external_read',
    'customer_communication',
    'storefront_publish',
    'supplier_purchase',
    'advertising_spend'
  ];
  v_autonomous text[] := array['research_read', 'database_read'];
begin
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    return query select 'invalid_lease'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;

  if p_agent_type is null or not (p_agent_type = any (v_supported)) then
    return query select 'unsupported_agent_type'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;

  if p_task_id is null then
    return query select 'not_found'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select *
  into v_task
  from public.agent_tasks
  where id = p_task_id
  for update;

  if not found then
    return query select 'not_found'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;

  if v_task.agent_type is distinct from p_agent_type then
    return query select 'agent_type_mismatch'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  if v_task.status = 'failed' then
    return query select 'failed_not_retried'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  if v_task.status = 'in_progress'
     and v_task.lease_expires_at is not null
     and v_task.lease_expires_at <= now() then
    return query select 'lease_expired'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  if v_task.status = 'in_progress' or v_task.started_at is not null then
    return query select 'already_claimed'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  if v_task.status is distinct from 'pending' then
    return query select 'not_pending'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  v_refusal := private.locked_task_claim_refusal(v_task);
  if v_refusal is not null then
    return query select v_refusal, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  select policy.capabilities
  into v_capabilities
  from private.agent_task_execution_policies as policy
  where policy.task_id = v_task.id;

  if v_capabilities is null or cardinality(v_capabilities) = 0 then
    return query select 'execution_policy_missing'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  if exists (
    select 1
    from unnest(v_capabilities) as capability
    where capability is null or not (capability = any (v_known))
  ) then
    return query select 'unknown_capability'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  if exists (
    select 1
    from unnest(v_capabilities) as capability
    where not (capability = any (v_autonomous))
  ) then
    return query select 'execution_policy_rejected'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  v_token := gen_random_uuid();
  v_expires := now() + make_interval(secs => p_lease_seconds);

  update public.agent_tasks
  set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    claim_token = v_token,
    lease_expires_at = v_expires
  where id = v_task.id
    and status = 'pending'
    and agent_type = p_agent_type;

  if not found then
    return query select 'already_claimed'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  return query select 'claimed'::text, v_task.id, v_token, v_expires;
end;
$$;

alter function private.claim_agent_task_by_id(uuid, text, integer) owner to postgres;
comment on function private.claim_agent_task_by_id(uuid, text, integer) is
  'Locks one pending task and rechecks its current text, dependencies, approvals, and stored policy before claiming it. It does not select another task, overwrite result or error_message, or reclaim an expired lease.';

revoke all on function private.claim_agent_task_by_id(uuid, text, integer) from public, anon, authenticated;
grant execute on function private.claim_agent_task_by_id(uuid, text, integer) to service_role;

create or replace function public.claim_agent_task_by_id(
  p_task_id uuid,
  p_agent_type text,
  p_lease_seconds integer
)
returns table (
  outcome text,
  task_id uuid,
  claim_token uuid,
  lease_expires_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select outcome, task_id, claim_token, lease_expires_at
  from private.claim_agent_task_by_id(p_task_id, p_agent_type, p_lease_seconds);
$$;

revoke all on function public.claim_agent_task_by_id(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_agent_task_by_id(uuid, text, integer) to service_role;

-- Token-checked settlement exists before execution is enabled.
-- These functions have no public wrapper and no service_role execute grant.
create or replace function private.complete_agent_task_claim(
  p_task_id uuid,
  p_claim_token uuid,
  p_result jsonb
)
returns table (
  outcome text,
  task_id uuid,
  claim_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_task public.agent_tasks%rowtype;
begin
  if p_claim_token is null or p_result is null or jsonb_typeof(p_result) is distinct from 'object' then
    return query select 'invalid_result'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;

  select * into v_task from public.agent_tasks where id = p_task_id for update;
  if not found then
    return query select 'not_found'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.claim_token is distinct from p_claim_token then
    return query select 'claim_token_mismatch'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.status is distinct from 'in_progress' then
    return query select 'not_in_progress'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.lease_expires_at is null or v_task.lease_expires_at <= now() then
    return query select 'lease_expired'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.result is not null then
    return query select 'result_already_present'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  update public.agent_tasks
  set
    status = 'completed',
    completed_at = now(),
    result = p_result,
    claim_token = null,
    lease_expires_at = null
  where id = v_task.id
    and claim_token = p_claim_token
    and status = 'in_progress'
    and result is null;

  return query select 'completed'::text, v_task.id, null::uuid, null::timestamptz;
end;
$$;

create or replace function private.fail_agent_task_claim(
  p_task_id uuid,
  p_claim_token uuid,
  p_error text
)
returns table (
  outcome text,
  task_id uuid,
  claim_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_task public.agent_tasks%rowtype;
begin
  select * into v_task from public.agent_tasks where id = p_task_id for update;
  if not found then
    return query select 'not_found'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;
  if p_claim_token is null or v_task.claim_token is distinct from p_claim_token then
    return query select 'claim_token_mismatch'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.status is distinct from 'in_progress' then
    return query select 'not_in_progress'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.lease_expires_at is null or v_task.lease_expires_at <= now() then
    return query select 'lease_expired'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  update public.agent_tasks
  set
    status = 'failed',
    completed_at = now(),
    error_message = coalesce(nullif(btrim(p_error), ''), 'Task failed'),
    claim_token = null,
    lease_expires_at = null
  where id = v_task.id
    and claim_token = p_claim_token
    and status = 'in_progress';

  return query select 'failed'::text, v_task.id, null::uuid, null::timestamptz;
end;
$$;

create or replace function private.renew_agent_task_lease(
  p_task_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer
)
returns table (
  outcome text,
  task_id uuid,
  claim_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_task public.agent_tasks%rowtype;
  v_expires timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    return query select 'invalid_lease'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;

  select * into v_task from public.agent_tasks where id = p_task_id for update;
  if not found then
    return query select 'not_found'::text, p_task_id, null::uuid, null::timestamptz;
    return;
  end if;
  if p_claim_token is null or v_task.claim_token is distinct from p_claim_token then
    return query select 'claim_token_mismatch'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.status is distinct from 'in_progress' then
    return query select 'not_in_progress'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;
  if v_task.lease_expires_at is null or v_task.lease_expires_at <= now() then
    return query select 'lease_expired'::text, v_task.id, null::uuid, null::timestamptz;
    return;
  end if;

  v_expires := now() + make_interval(secs => p_lease_seconds);
  update public.agent_tasks
  set lease_expires_at = v_expires
  where id = v_task.id
    and claim_token = p_claim_token
    and status = 'in_progress'
    and lease_expires_at > now();

  return query select 'renewed'::text, v_task.id, v_task.claim_token, v_expires;
end;
$$;

alter function private.complete_agent_task_claim(uuid, uuid, jsonb) owner to postgres;
alter function private.fail_agent_task_claim(uuid, uuid, text) owner to postgres;
alter function private.renew_agent_task_lease(uuid, uuid, integer) owner to postgres;

revoke all on function private.complete_agent_task_claim(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.fail_agent_task_claim(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.renew_agent_task_lease(uuid, uuid, integer) from public, anon, authenticated, service_role;

comment on function private.complete_agent_task_claim(uuid, uuid, jsonb) is
  'Completes one unexpired lease when the claim token matches and result is still empty. Not granted to service_role until execution is enabled.';
comment on function private.fail_agent_task_claim(uuid, uuid, text) is
  'Fails one unexpired lease when the claim token matches. It does not change result and does not retry the task.';
comment on function private.renew_agent_task_lease(uuid, uuid, integer) is
  'Extends one unexpired lease when the claim token matches. An expired lease cannot be renewed.';

-- The legacy function body stays as it is. Its PUBLIC and browser-role execute
-- grants are removed so the Data API cannot claim tasks with the anon key.
revoke all on function public.claim_next_agent_task(text) from public, anon, authenticated;
grant execute on function public.claim_next_agent_task(text) to service_role;
