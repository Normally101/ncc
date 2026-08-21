# Censimento Doppio Conteggio Cassa / Valuta

Data: 21/08/2026
File esaminati:
- p2p-market.js
- p2p-render.js
- vtk-market.js
- auctions.js

## p2p-market.js
- riga 77 — `listCarForSale` chiama `rpc_list_car_for_sale` (nessuna chiamata CE_money successiva)
  RPC: 08_mmo_p2p_marketplace.sql:86 — RPC non tocca il saldo → corretto cosi'
- riga 106 — `cancelP2PListing` chiama `rpc_cancel_listing` (nessuna chiamata CE_money successiva)
  RPC: 08_mmo_p2p_marketplace.sql:127 — RPC non tocca il saldo → corretto cosi'
- riga 138 — `buyP2PCar` chiama `rpc_buy_market_car` poi `CE_money.spend` (riga 144)
  RPC: 52_fix_p2p_sindacato_cash_source_of_truth.sql:143 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 163 — `createHolding` chiama `rpc_create_holding` (nessuna chiamata CE_money successiva)
  RPC: 08_mmo_p2p_marketplace.sql:318 — RPC non tocca il saldo → corretto cosi'
- riga 174 — `joinHolding` chiama `rpc_join_holding` (nessuna chiamata CE_money successiva)
  RPC: 08_mmo_p2p_marketplace.sql:356 — RPC non tocca il saldo → corretto cosi'
- riga 183 — `leaveHolding` chiama `rpc_leave_holding` (nessuna chiamata CE_money successiva)
  RPC: 08_mmo_p2p_marketplace.sql:389 — RPC non tocca il saldo → corretto cosi'
- riga 198 — `contributeHoldingTreasury` chiama `rpc_contribute_holding_treasury` poi `CE_money.spend` (riga 202)
  RPC: 08_mmo_p2p_marketplace.sql:440 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 242 — `listCompanyIPO` chiama `rpc_list_company_ipo` poi `CE_money.spend` (riga 250)
  RPC: 08_mmo_p2p_marketplace.sql:534 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 278 — `buyCompanyShares` chiama `rpc_buy_company_shares` poi `CE_money.spend` (riga 283)
  RPC: 52_fix_p2p_sindacato_cash_source_of_truth.sql:206 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 293 — `sellCompanyShares` chiama `rpc_sell_company_shares` poi `CE_money.earn` (riga 298)
  RPC: 08_mmo_p2p_marketplace.sql:660 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 403 — `p2pFetchTension` chiama `rpc_tick_tension` (nessuna chiamata CE_money successiva)
  RPC: 15_sindacato_mechanics.sql:32 — RPC non tocca il saldo → corretto cosi'
- riga 417 — `p2pFetchGdfRisk` chiama `rpc_get_gdf_risk` (nessuna chiamata CE_money successiva)
  RPC: 15_sindacato_mechanics.sql:280 — RPC non tocca il saldo → corretto cosi'
- riga 427 — `_sindacatoGdfDailyCheck` chiama `rpc_gdf_inspection_check` poi `CE_money.spend` (riga 433)
  RPC: 15_sindacato_mechanics.sql:382 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO

## p2p-render.js
- riga 389 — `createConsorzio` chiama `rpc_create_consorzio` (nessuna chiamata CE_money successiva)
  RPC: 15_sindacato_mechanics.sql:149 — RPC non tocca il saldo → corretto cosi'
- riga 398 — `joinConsorzio` chiama `rpc_join_consorzio` (nessuna chiamata CE_money successiva)
  RPC: 15_sindacato_mechanics.sql:174 — RPC non tocca il saldo → corretto cosi'
- riga 407 — `leaveConsorzio` chiama `rpc_leave_consorzio` (nessuna chiamata CE_money successiva)
  RPC: 15_sindacato_mechanics.sql:198 — RPC non tocca il saldo → corretto cosi'
- riga 419 — `contributeConsorzio` chiama `rpc_contribute_consorzio` preceduta da `CE_money.spend` (riga 418)
  RPC: 15_sindacato_mechanics.sql:239 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO
- riga 438 — `hireCrumiri` chiama `rpc_hire_crumiri` (nessuna chiamata CE_money successiva)
  RPC: 15_sindacato_mechanics.sql:303 — RPC non tocca il saldo → corretto cosi'
- riga 452 — `payDonCarmine` chiama `rpc_pay_don_carmine` preceduta da `CE_money.spend` (riga 451)
  RPC: 15_sindacato_mechanics.sql:338 / 52_fix_p2p_sindacato_cash_source_of_truth.sql:47 — `UPDATE public.companies SET cash = cash + v_delta` → DOPPIO CONTEGGIO

## vtk-market.js
- riga 94 — `vtkRefreshOrders` chiama `rpc_get_vtk_market_orders` (nessuna chiamata CE_money successiva)
  RPC: 61_fix_vtk_orders_provinces_pacing.sql:18 — RPC non tocca il saldo → corretto cosi'
- riga 112 — `vtkPlaceSellOrder` chiama `rpc_place_vtk_sell_order` (nessuna chiamata CE_money successiva)
  RPC: 21_vtk_token.sql:98 — `UPDATE companies SET vtk_balance = ...` ma non tocca cash / DC e client non chiama CE_money → corretto cosi'
- riga 134 — `vtkFillOrder` chiama `rpc_fill_vtk_order` poi `CE_money.spendDC` (riga 140)
  RPC: 21_vtk_token.sql:128 — `UPDATE companies SET driver_coins = driver_coins - v_cost, vtk_balance = vtk_balance + v_order.vtk_amount ...` → DOPPIO CONTEGGIO (driver_coins)
- riga 152 — `vtkCancelOrder` chiama `rpc_cancel_vtk_order` (nessuna chiamata CE_money successiva)
  RPC: 21_vtk_token.sql:154 — `UPDATE companies SET vtk_balance = ...` ma client non chiama CE_money → corretto cosi'
- riga 208 — `vtkBuyShopItem` chiama `rpc_spend_vtk_shop_item` (nessuna chiamata CE_money successiva)
  RPC: 46_vtk_shop_purchase_scaffold.sql:63 — `UPDATE public.companies SET vtk_balance = ...` ma client applica item senza chiamare CE_money → corretto cosi'

## auctions.js
- riga 66 — `auctionsRefresh` chiama `rpc_get_judicial_auctions`, `rpc_get_won_auctions`, `rpc_get_my_bids` (nessuna chiamata CE_money successiva)
  RPC: 62_aste_ciclo_di_vita.sql:34 — RPC non tocca il saldo → corretto cosi'
- riga 80 — `auctionsPlaceBid` chiama `rpc_place_auction_bid` (nessuna chiamata CE_money successiva)
  RPC: 62_aste_ciclo_di_vita.sql:186 — RPC non tocca il saldo al momento dell'offerta → corretto cosi'
- riga 225 — `auctionsClaim` chiama `rpc_claim_auction` poi `CE_money.accreditatoDalServer` (riga 231)
  RPC: 62_aste_ciclo_di_vita.sql:101 — `UPDATE public.companies SET cash = cash + v_contanti ...` ma client usa `CE_money.accreditatoDalServer` (non risincronizza con syncCash) → corretto cosi'
