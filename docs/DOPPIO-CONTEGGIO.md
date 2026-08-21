# Censimento Doppio Conteggio Cassa (RPC vs CE_money)
Data: 2026-08-21
File esaminati: p2p-market.js, p2p-render.js, vtk-market.js, auctions.js

## p2p-market.js
- riga 138 — `buyP2PCar` chiama `rpc_buy_market_car` poi `CE_money.spend` (riga 144)
  RPC: 52_fix_p2p_sindacato_cash_source_of_truth.sql:145 (e 08_mmo_p2p_marketplace.sql:206 via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 198 — `contributeHoldingTreasury` chiama `rpc_contribute_holding_treasury` poi `CE_money.spend` (riga 202)
  RPC: 08_mmo_p2p_marketplace.sql:438 (via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 247 — `listCompanyIPO` chiama `rpc_list_company_ipo` poi `CE_money.spend` (riga 254)
  RPC: 08_mmo_p2p_marketplace.sql:505 (via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 287 — `buyCompanyShares` chiama `rpc_buy_company_shares` poi `CE_money.spend` (riga 291)
  RPC: 52_fix_p2p_sindacato_cash_source_of_truth.sql:193 (e 08_mmo_p2p_marketplace.sql:543 via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 301 — `sellCompanyShares` chiama `rpc_sell_company_shares` poi `CE_money.earn` (riga 305)
  RPC: 08_mmo_p2p_marketplace.sql:590 (via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 427 — `_sindacatoGdfDailyCheck` chiama `rpc_gdf_inspection_check` poi `CE_money.spend` (riga 432)
  RPC: 15_sindacato_mechanics.sql:380 (via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO

## p2p-render.js
- riga 223 — `contributeConsorzio` chiama `CE_money.spend` e subito dopo `rpc_contribute_consorzio` (riga 224)
  RPC: 15_sindacato_mechanics.sql:228 (via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 249 — `payDonCarmine` chiama `CE_money.spend` e subito dopo `rpc_pay_don_carmine` (riga 250)
  RPC: 15_sindacato_mechanics.sql:338 (via `_add_player_cash`: 52_fix_p2p_sindacato_cash_source_of_truth.sql:47) — `UPDATE companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO

