-- Replace approval_evidence_anchor after 20261114180000_approval_workflow.sql.
-- The previous function declared a PL/pgSQL variable named verification_id.
-- supplier_shipping_quotes.verification_id made that reference ambiguous (42702),
-- so create_product_review_request failed before inserting a review.
-- This statement does not change product decisions or create a review.
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

