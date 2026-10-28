-- FR-007: a complete sale pair marks a fully closed position; ownership RLS is unchanged.
alter table public.positions
  add column sell_price numeric(20,8),
  add column sell_date date,
  add constraint positions_sale_pair check ((sell_price is null) = (sell_date is null)),
  add constraint positions_sell_price_nonnegative check (sell_price >= 0),
  add constraint positions_sell_date_after_buy check (sell_date >= buy_date);
