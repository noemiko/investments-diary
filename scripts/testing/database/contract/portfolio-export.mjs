import { asAnon, asPrivileged, asUser, assert, expectError, fixtureId } from "../lib/db-harness.mjs";

const id = (kind, n = 1) => fixtureId("portfolio-export", kind, n);
export default function portfolioExport(db) {
  db.sql(`${asPrivileged()}
    insert into auth.users(id) values ('${id(0)}'),('${id(0, 2)}');
    insert into public.wallets(id,user_id,name,starting_value,currency) values
      ('${id(1)}','${id(0)}','Empty USD',999999999999.12345678,'USD'),
      ('${id(1, 2)}','${id(0, 2)}','Foreign',2,'EUR');
    insert into public.reason_categories(id,user_id,name,deleted_at) values
      ('${id(2)}','${id(0)}','Retired referenced',statement_timestamp()),
      ('${id(2, 2)}','${id(0)}','Unused category',null);
    insert into public.market_listing_targets(id,user_id,provider,symbol,exchange,listing_name,exchange_name,instrument_type)
      values ('${id(3)}','${id(0)}','yahoo','AAPL','NMS','Apple','Nasdaq','EQUITY');
    insert into public.market_selection_receipts(id,user_id,wallet_id,target_id)
      values ('${id(4)}','${id(0)}','${id(1)}','${id(3)}');
    insert into public.positions(id,user_id,instrument,buy_price,buy_date,category_id,wallet_id,market_selection_receipt_id,reason_text)
      values ('${id(5)}','${id(0)}','AAPL',123.12345678,'2026-01-01','${id(2)}','${id(1)}','${id(4)}',E'Unicode ąęł\\nReason'),
      ('${id(5, 2)}','${id(0)}','AAPL',10,'2026-01-01','${id(2)}','${id(1)}','${id(4)}',null);
    update public.positions set deleted_at=statement_timestamp() where id='${id(5, 2)}';
    ${asUser(id(0))}
    ${assert("jsonb_array_length(public.portfolio_export_snapshot()->'wallets')=1", "snapshot leaked foreign wallet")}
    ${assert("jsonb_array_length(public.portfolio_export_snapshot()->'positions')=1", "snapshot included deleted investments")}
    ${assert("jsonb_array_length(public.portfolio_export_snapshot()->'categories')=1", "snapshot included unrelated category")}
    ${assert(`public.portfolio_export_snapshot()#>>'{categories,0,name}'='Retired referenced'`, "snapshot lost retired referenced category")}
    ${assert(`jsonb_typeof(public.portfolio_export_snapshot()#>'{wallets,0,starting_value}')='string'`, "starting value is numeric JSON")}
    ${assert(`public.portfolio_export_snapshot()#>>'{wallets,0,starting_value}'='999999999999.12345678'`, "starting value lost precision")}
    ${assert(`public.portfolio_export_snapshot()#>>'{positions,0,buy_price}'='123.12345678'`, "price lost precision")}
    ${assert(`not ((public.portfolio_export_snapshot()#>'{positions,0}') ? 'user_id')`, "snapshot exposes source ownership")}
    ${assert(`not ((public.portfolio_export_snapshot()#>'{positions,0}') ? 'market_selection_receipt_id')`, "snapshot exports expiring receipt")}
    ${assert(`public.portfolio_export_snapshot()#>>'{positions,0,reason_text}'=E'Unicode ąęł\\nReason'`, "snapshot omitted recorded reason")}
    ${asUser(id(0, 2))}
    ${assert("jsonb_array_length(public.portfolio_export_snapshot()->'positions')=0", "foreign holdings leaked")}
    ${asAnon()}
    ${expectError("42501", "perform public.portfolio_export_snapshot()", "anonymous export allowed")}
  `);
  return "consistent owner-scoped export includes exact text facts and retired references; omits deleted/unrelated/foreign data";
}
