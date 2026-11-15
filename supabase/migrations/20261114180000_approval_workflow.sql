-- Approval workflow. Not applied until reviewed.
-- product_review records a human review only. It does not approve a product
-- for sale and does not authorize publishing, purchasing, advertising, or
-- agent execution.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.dashboard_owner (
  singleton boolean primary key default true,
  user_id uuid not null,
  constraint dashboard_owner_singleton check (singleton)
);

comment on table private.dashboard_owner is
  'Immutable dashboard owner auth user id. Insert one row with the service role after this migration. Anonymous and authenticated roles have no access.';

alter table private.dashboard_owner enable row level security;
alter table private.dashboard_owner force row level security;
revoke all on table private.dashboard_owner from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on table private.dashboard_owner to service_role;

-- postgres is the SQL Editor role and the owner of this security-definer function.
-- Superusers bypass RLS, including FORCE ROW LEVEL SECURITY. This policy keeps
-- the read working if the owner is ever subject to forced RLS. Anonymous and
-- authenticated roles receive no privilege from it.
create policy dashboard_owner_postgres_access
  on private.dashboard_owner
  for all
  to postgres
  using (true)
  with check (true);

create or replace function private.dashboard_actor_is_owner(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private
as $$
  select p_actor_id is not null
    and exists (
      select 1
      from private.dashboard_owner
      where singleton
        and user_id = p_actor_id
    );
$$;

alter function private.dashboard_actor_is_owner(uuid) owner to postgres;
comment on function private.dashboard_actor_is_owner(uuid) is
  'Owned by postgres and executed as postgres because it is SECURITY DEFINER. postgres can read private.dashboard_owner. anon and authenticated have no execute or table privilege.';

revoke all on function private.dashboard_actor_is_owner(uuid) from public, anon, authenticated;
grant execute on function private.dashboard_actor_is_owner(uuid) to service_role;

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.product_candidates(id),
  source_decision_id uuid not null references public.product_decisions(id),
  requested_action text not null default 'product_review'
    check (requested_action = 'product_review'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  evidence_snapshot jsonb not null,
  evidence_anchor jsonb not null,
  decision_summary jsonb not null,
  decision_fingerprint text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  requested_by uuid not null,
  reviewer_id uuid,
  reviewer_notes text,
  check (
    (status = 'pending' and resolved_at is null and reviewer_id is null)
    or (status in ('approved', 'rejected', 'cancelled') and resolved_at is not null and reviewer_id is not null)
  )
);

create unique index if not exists approval_requests_open_decision_idx
  on public.approval_requests (source_decision_id, requested_action)
  where status in ('pending', 'approved');

create index if not exists approval_requests_status_created_idx
  on public.approval_requests (status, created_at desc);

create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id),
  event_type text not null
    check (event_type in (
      'created',
      'approved',
      'rejected',
      'duplicate_submission',
      'stale_evidence',
      'superseded_decision'
    )),
  actor_id uuid not null,
  previous_status text,
  new_status text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists approval_events_request_created_idx
  on public.approval_events (approval_request_id, created_at);

alter table public.approval_requests enable row level security;
alter table public.approval_events enable row level security;
revoke all on table public.approval_requests from public, anon, authenticated;
revoke all on table public.approval_events from public, anon, authenticated;

create or replace function public.prevent_approval_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'approval_events is append-only';
end;
$$;

drop trigger if exists approval_events_append_only on public.approval_events;
create trigger approval_events_append_only
before update or delete on public.approval_events
for each row execute function public.prevent_approval_event_mutation();

create or replace function public.approval_identity_hash(payload jsonb)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(payload::text, 'utf8'), 'sha256'), 'hex');
$$;

create or replace function public.product_decision_fingerprint(p_decision_id uuid)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.approval_identity_hash(jsonb_build_object(
    'id', d.id,
    'candidate_id', d.candidate_id,
    'listing_id', d.listing_id,
    'recommendation', d.recommendation,
    'decision_status', d.decision_status,
    'approval_status', d.approval_status,
    'decision_score', d.decision_score,
    'engine_version', d.engine_version,
    'created_at', d.created_at,
    'evidence_snapshot', d.evidence_snapshot
  ))
  from public.product_decisions as d
  where d.id = p_decision_id;
$$;

-- Identity of the supplier rows the decision engine already compares.
-- This does not recompute contribution, margin, or any other financial result.
create or replace function public.approval_evidence_anchor(p_decision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  decision public.product_decisions%rowtype;
  listing public.supplier_product_listings%rowtype;
  verification public.supplier_listing_verifications%rowtype;
  snapshot_verification_id uuid;
  quotes jsonb;
  analyses jsonb;
begin
  select * into decision from public.product_decisions where id = p_decision_id;
  if not found or decision.listing_id is null then
    return null;
  end if;

  select * into listing
  from public.supplier_product_listings
  where id = decision.listing_id;

  if not found then
    return null;
  end if;

  snapshot_verification_id := nullif(decision.evidence_snapshot->>'verification_id', '')::uuid;

  if snapshot_verification_id is not null then
    select * into verification
    from public.supplier_listing_verifications
    where id = snapshot_verification_id
      and listing_id = listing.id;
    if not found then
      return null;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'hash', public.approval_identity_hash(jsonb_build_object(
      'id', q.id,
      'verification_id', q.verification_id,
      'market', q.market,
      'quantity', q.quantity,
      'currency', q.currency,
      'variant_description', q.variant_description,
      'shipping_method', q.shipping_method,
      'shipping_cost', q.shipping_cost,
      'verification_status', q.verification_status,
      'evidence_source', q.evidence_source,
      'captured_at', q.captured_at,
      'destination_region', q.destination_region,
      'destination_postal_code', q.destination_postal_code
    ))
  ) order by q.id), '[]'::jsonb)
  into quotes
  from public.supplier_shipping_quotes as q
  where snapshot_verification_id is not null
    and q.verification_id = snapshot_verification_id
    and q.quantity = 1
    and q.currency is not distinct from verification.currency
    and lower(btrim(coalesce(q.variant_description, ''))) <> ''
    and lower(btrim(q.variant_description)) = lower(btrim(coalesce(verification.variant_description, '')));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'market', a.market,
    'created_at', a.created_at,
    'hash', public.approval_identity_hash(jsonb_build_object(
      'id', a.id,
      'listing_id', a.listing_id,
      'verification_id', a.verification_id,
      'shipping_quote_id', a.shipping_quote_id,
      'market', a.market,
      'currency', a.currency,
      'analysis_status', a.analysis_status,
      'approval_status', a.approval_status,
      'calculator_version', a.calculator_version,
      'created_at', a.created_at,
      'evidence_snapshot', a.evidence_snapshot,
      'calculation', a.calculation
    ))
  ) order by a.created_at, a.id), '[]'::jsonb)
  into analyses
  from public.product_profitability_analyses as a
  where a.listing_id = listing.id;

  return jsonb_build_object(
    'listing_id', listing.id,
    'listing_hash', public.approval_identity_hash(jsonb_build_object(
      'id', listing.id,
      'sku', listing.sku,
      'candidate_id', listing.candidate_id,
      'verification_status', listing.verification_status
    )),
    'verification_id', snapshot_verification_id,
    'verification_hash', case
      when snapshot_verification_id is null then null
      else public.approval_identity_hash(jsonb_build_object(
        'id', verification.id,
        'listing_id', verification.listing_id,
        'product_url', verification.product_url,
        'sku_match_confirmed', verification.sku_match_confirmed,
        'displayed_price', verification.displayed_price,
        'currency', verification.currency,
        'variant_description', verification.variant_description,
        'shipping_ca_status', verification.shipping_ca_status,
        'shipping_us_status', verification.shipping_us_status,
        'food_contact_documentation_status', verification.food_contact_documentation_status,
        'review_status', verification.review_status
      ))
    end,
    'snapshot_listing_id', decision.evidence_snapshot->>'listing_id',
    'snapshot_verification_id', decision.evidence_snapshot->>'verification_id',
    'snapshot_quote_ca', decision.evidence_snapshot#>>'{markets,CA,quote_id}',
    'snapshot_quote_us', decision.evidence_snapshot#>>'{markets,US,quote_id}',
    'snapshot_analysis_ca', decision.evidence_snapshot#>>'{markets,CA,analysis_id}',
    'snapshot_analysis_us', decision.evidence_snapshot#>>'{markets,US,analysis_id}',
    'quotes', quotes,
    'analyses', analyses
  );
end;
$$;

create or replace function public.approval_decision_block_reason(p_decision_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  decision public.product_decisions%rowtype;
  anchor jsonb;
begin
  select * into decision from public.product_decisions where id = p_decision_id;
  if not found or decision.listing_id is null then
    return 'decision_not_found';
  end if;

  if exists (
    select 1
    from public.product_decisions as newer
    where newer.listing_id = decision.listing_id
      and (newer.created_at, newer.id) > (decision.created_at, decision.id)
  ) then
    return 'superseded_decision';
  end if;

  anchor := public.approval_evidence_anchor(p_decision_id);
  if anchor is null
    or anchor->>'snapshot_listing_id' is distinct from decision.listing_id::text
    or anchor->>'snapshot_verification_id' is distinct from anchor->>'verification_id'
  then
    return 'stale_evidence';
  end if;

  if anchor->>'snapshot_quote_ca' is not null
    and not exists (
      select 1
      from jsonb_array_elements(anchor->'quotes') as quote
      where quote->>'id' = anchor->>'snapshot_quote_ca'
    )
  then
    return 'stale_evidence';
  end if;

  if anchor->>'snapshot_quote_us' is not null
    and not exists (
      select 1
      from jsonb_array_elements(anchor->'quotes') as quote
      where quote->>'id' = anchor->>'snapshot_quote_us'
    )
  then
    return 'stale_evidence';
  end if;

  if anchor->>'snapshot_analysis_ca' is not null
    and (
      select analysis->>'id'
      from jsonb_array_elements(anchor->'analyses') as analysis
      where analysis->>'market' = 'CA'
      order by analysis->>'created_at' desc, analysis->>'id' desc
      limit 1
    ) is distinct from anchor->>'snapshot_analysis_ca'
  then
    return 'stale_evidence';
  end if;

  if anchor->>'snapshot_analysis_us' is not null
    and (
      select analysis->>'id'
      from jsonb_array_elements(anchor->'analyses') as analysis
      where analysis->>'market' = 'US'
      order by analysis->>'created_at' desc, analysis->>'id' desc
      limit 1
    ) is distinct from anchor->>'snapshot_analysis_us'
  then
    return 'stale_evidence';
  end if;

  return null;
end;
$$;

create or replace function public.create_product_review_request(
  p_decision_id uuid,
  p_actor_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, private
as $$
declare
  decision public.product_decisions%rowtype;
  candidate_name text;
  fingerprint text;
  anchor jsonb;
  block_reason text;
  request_row public.approval_requests%rowtype;
  summary jsonb;
begin
  if not private.dashboard_actor_is_owner(p_actor_id) then
    return jsonb_build_object('ok', false, 'code', 'unauthorized_reviewer');
  end if;

  select * into decision from public.product_decisions where id = p_decision_id;
  if not found or decision.listing_id is null then
    return jsonb_build_object('ok', false, 'code', 'decision_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(decision.listing_id::text, 0));

  block_reason := public.approval_decision_block_reason(p_decision_id);
  if block_reason is not null then
    return jsonb_build_object('ok', false, 'code', block_reason);
  end if;

  select name into candidate_name
  from public.product_candidates
  where id = decision.candidate_id;

  fingerprint := public.product_decision_fingerprint(p_decision_id);
  anchor := public.approval_evidence_anchor(p_decision_id);
  if fingerprint is null or anchor is null then
    return jsonb_build_object('ok', false, 'code', 'stale_evidence');
  end if;

  summary := jsonb_build_object(
    'product_name', coalesce(candidate_name, 'Unknown product'),
    'recommendation', decision.recommendation,
    'decision_status', decision.decision_status,
    'approval_status', decision.approval_status,
    'decision_score', decision.decision_score,
    'reasons', decision.reasons,
    'risks', decision.risks,
    'next_actions', decision.next_actions,
    'engine_version', decision.engine_version,
    'created_at', decision.created_at,
    'scope', 'product_review records a human review only'
  );

  insert into public.approval_requests (
    candidate_id,
    source_decision_id,
    requested_action,
    status,
    evidence_snapshot,
    evidence_anchor,
    decision_summary,
    decision_fingerprint,
    requested_by,
    reviewer_notes
  ) values (
    decision.candidate_id,
    decision.id,
    'product_review',
    'pending',
    coalesce(decision.evidence_snapshot, '{}'::jsonb),
    anchor,
    summary,
    fingerprint,
    p_actor_id,
    null
  )
  returning * into request_row;

  insert into public.approval_events (
    approval_request_id, event_type, actor_id, previous_status, new_status, notes
  ) values (
    request_row.id,
    'created',
    p_actor_id,
    null,
    'pending',
    nullif(btrim(coalesce(p_notes, '')), '')
  );

  return jsonb_build_object('ok', true, 'request_id', request_row.id, 'status', 'pending');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate_request');
end;
$$;

create or replace function public.resolve_approval_request(
  p_request_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, private
as $$
declare
  request_row public.approval_requests%rowtype;
  decision public.product_decisions%rowtype;
  notes text := nullif(btrim(coalesce(p_notes, '')), '');
  block_reason text;
  updated_count integer;
begin
  if not private.dashboard_actor_is_owner(p_actor_id) then
    return jsonb_build_object('ok', false, 'code', 'unauthorized_reviewer');
  end if;

  if p_decision not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_action');
  end if;

  select * into request_row
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if request_row.requested_action <> 'product_review' then
    return jsonb_build_object('ok', false, 'code', 'invalid_action');
  end if;

  if request_row.status <> 'pending' then
    insert into public.approval_events (
      approval_request_id, event_type, actor_id, previous_status, new_status, notes
    ) values (
      request_row.id, 'duplicate_submission', p_actor_id, request_row.status, request_row.status, notes
    );
    return jsonb_build_object('ok', false, 'code', 'not_pending');
  end if;

  select * into decision
  from public.product_decisions
  where id = request_row.source_decision_id;

  if not found or decision.listing_id is null then
    insert into public.approval_events (
      approval_request_id, event_type, actor_id, previous_status, new_status, notes
    ) values (
      request_row.id, 'stale_evidence', p_actor_id, 'pending', 'pending', notes
    );
    return jsonb_build_object('ok', false, 'code', 'stale_evidence');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(decision.listing_id::text, 0));

  if public.product_decision_fingerprint(decision.id) is distinct from request_row.decision_fingerprint
    or public.approval_evidence_anchor(decision.id) is distinct from request_row.evidence_anchor
  then
    insert into public.approval_events (
      approval_request_id, event_type, actor_id, previous_status, new_status, notes
    ) values (
      request_row.id, 'stale_evidence', p_actor_id, 'pending', 'pending', notes
    );
    return jsonb_build_object('ok', false, 'code', 'stale_evidence');
  end if;

  block_reason := public.approval_decision_block_reason(decision.id);
  if block_reason = 'superseded_decision' then
    insert into public.approval_events (
      approval_request_id, event_type, actor_id, previous_status, new_status, notes
    ) values (
      request_row.id, 'superseded_decision', p_actor_id, 'pending', 'pending', notes
    );
    return jsonb_build_object('ok', false, 'code', 'superseded_decision');
  end if;

  if block_reason is not null then
    insert into public.approval_events (
      approval_request_id, event_type, actor_id, previous_status, new_status, notes
    ) values (
      request_row.id, 'stale_evidence', p_actor_id, 'pending', 'pending', notes
    );
    return jsonb_build_object('ok', false, 'code', block_reason);
  end if;

  update public.approval_requests
  set
    status = p_decision,
    resolved_at = now(),
    reviewer_id = p_actor_id,
    reviewer_notes = notes
  where id = request_row.id
    and status = 'pending';

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    insert into public.approval_events (
      approval_request_id, event_type, actor_id, previous_status, new_status, notes
    ) values (
      request_row.id, 'duplicate_submission', p_actor_id, request_row.status, request_row.status, notes
    );
    return jsonb_build_object('ok', false, 'code', 'not_pending');
  end if;

  insert into public.approval_events (
    approval_request_id, event_type, actor_id, previous_status, new_status, notes
  ) values (
    request_row.id, p_decision, p_actor_id, 'pending', p_decision, notes
  );

  return jsonb_build_object('ok', true, 'request_id', request_row.id, 'status', p_decision);
end;
$$;

revoke all on function public.approval_identity_hash(jsonb) from public, anon, authenticated;
revoke all on function public.product_decision_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.approval_evidence_anchor(uuid) from public, anon, authenticated;
revoke all on function public.approval_decision_block_reason(uuid) from public, anon, authenticated;
revoke all on function public.create_product_review_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_approval_request(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.prevent_approval_event_mutation() from public, anon, authenticated;

grant execute on function public.approval_identity_hash(jsonb) to service_role;
grant execute on function public.product_decision_fingerprint(uuid) to service_role;
grant execute on function public.approval_evidence_anchor(uuid) to service_role;
grant execute on function public.approval_decision_block_reason(uuid) to service_role;
grant execute on function public.create_product_review_request(uuid, uuid, text) to service_role;
grant execute on function public.resolve_approval_request(uuid, uuid, text, text) to service_role;
