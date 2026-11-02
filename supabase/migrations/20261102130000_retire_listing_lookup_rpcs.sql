-- Retire existing-position listing lookup/confirmation at the database.
-- Owner decision 2026-11-02: a holding has exactly one stock identity, its creation-time selection
-- (positions.market_target_id). The listing search/download/confirm endpoints already answer 409
-- selection_already_set, but these RPCs stayed executable, so a signed-in client could still link a
-- holding to a different listing through confirm_listing_lookup over PostgREST.
-- Only EXECUTE is revoked: functions, market_listing_lookups rows and their RLS policies stay as they
-- are. Rollback, if ever needed: re-grant EXECUTE to authenticated in a new migration.
-- Unguarded on purpose: REVOKE has no `if not exists` form and is idempotent anyway.

revoke execute on function public.claim_listing_lookup(uuid) from public, anon, authenticated;
revoke execute on function public.finish_listing_lookup(uuid, uuid, uuid, timestamptz, boolean)
  from public, anon, authenticated;
revoke execute on function public.confirm_listing_lookup(uuid, uuid) from public, anon, authenticated;
