-- Owner decision 2026-11-02: a holding's only stock identity is its required selection, and a
-- confirmed listing is attached only by a verified Download prices (security-definer
-- finish_market_target). Signed-in users therefore lose direct UPDATE on the listing columns that
-- the retired existing-position confirm flow needed. Data, other column grants and the
-- ownership/currency trigger are unchanged. Additive rollback: re-grant in a new migration.
revoke update(market_listing_id,listing_confirmed_at) on public.positions from authenticated;
