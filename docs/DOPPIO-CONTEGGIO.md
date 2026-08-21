# Censimento doppio conteggio cassa / valuta

Data: 21/08/2026

**Il difetto cercato:** la RPC muove i soldi sul server, e POI il client li muove
di nuovo con `CE_money`, che rispedisce al server il totale calcolato dal browser.
Se l'eco Realtime della scrittura del server arriva prima — probabile, perché la
RPC risponde a scrittura già avvenuta — il saldo si muove due volte. Sulla
vendita sono soldi regalati.

**Come è stato fatto:** tre lavori in parallelo, quattro file ciascuno, ognuno con
la prova in mano — la riga del `.sql` che muove il saldo. Uniti a mano il 21/08
perché scrivevano tutti e tre sullo stesso documento e i rami litigavano: la
colpa è di chi ha scritto i lavori (li avevo mandati sullo stesso file), non
dell'automatismo.

File esaminati: p2p-market.js, p2p-render.js, vtk-market.js, auctions.js,
alliances.js, hostile_takeover.js, infrastructure.js, b2b.js, nemesis.js,
tourism.js, black_ops.js, vip-clients.js — dodici in tutto.

**NON è ancora una correzione.** Ogni riga marcata DOPPIO CONTEGGIO è un lavoro
successivo, uno per file, con il suo test che diventa rosso sul codice di adesso.

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

## alliances.js
- riga 288 — `_alCreate` chiama `CE_money.spend` poi `rpc_create_alliance`
  RPC: non presente nel repo (definita su Supabase) — RPC non tocca il saldo → corretto cosi'
- riga 324 — `_alDonate` chiama `CE_money.spend` poi `rpc_donate_to_alliance`
  RPC: 54_fix_donate_to_alliance_cash_source_of_truth.sql:57 — `UPDATE public.companies SET cash = cash - p_amount::bigint WHERE user_id = v_uid;` → DOPPIO CONTEGGIO

## hostile_takeover.js
- riga 133 — `_opaRequestBuyback` chiama `CE_money.spend` poi `rpc_opa_buyback`
  RPC: 27_hostile_takeovers.sql:177 — `UPDATE public.companies SET cash = cash - v_opa.buyback_price WHERE user_id = v_uid;` → DOPPIO CONTEGGIO

## infrastructure.js
- riga 140 — `_infraBuyDepot` chiama `CE_money.spend` poi `rpc_buy_fuel_depot`
  RPC: 30_sql_patch.sql:81 — `UPDATE companies SET cash = cash - v_cost, liquid_assets = GREATEST(0, liquid_assets - v_cost) WHERE user_id = v_uid;` → DOPPIO CONTEGGIO

## b2b.js
- riga 121 — `b2bTerminateContract` chiama `rpc_terminate_b2b_contract` poi `CE_money.spend` (riga 131)
  RPC: 19_b2b_contracts.sql:241 — `UPDATE public.companies SET cash = cash - v_penalty, liquid_assets = GREATEST(0, liquid_assets - v_penalty)...` → DOPPIO CONTEGGIO
- riga 144 — `_b2bDailyTick` chiama `rpc_b2b_daily_tick` poi `CE_money.earn` (riga 154)
  RPC: 19_b2b_contracts.sql:207 — `UPDATE public.companies SET cash = cash + v_payout, liquid_assets = liquid_assets + v_payout...` → DOPPIO CONTEGGIO

## nemesis.js
- riga 87 — `_nemesisFundRival` chiama `rpc_nemesis_fund_rival`
  RPC: 28_nemesis_vip.sql:33 — `UPDATE public.companies SET cash = cash + v_amount WHERE user_id = v_rival_user_id;` → corretto cosi' (la RPC accredita il rivale, il client target non chiama CE_money)
- riga 106 — `_nemesisBribeVip` chiama `CE_money.spend`
  RPC: non chiamata (esiste `rpc_nemesis_bribe_vip` in 28_nemesis_vip.sql:47 ma il client non la invoca) → corretto cosi'

## tourism.js
- riga 83 — `tourismRefresh` chiama `rpc_get_tourism_tenders`
  RPC: 33_tourism_tenders.sql:240 — RPC non tocca il saldo → corretto cosi'
- riga 99 — `tourismSubmitBid` chiama `rpc_submit_tourism_bid`
  RPC: 33_tourism_tenders.sql:290 — RPC non tocca il saldo → corretto cosi'
- riga 113 — `tourismCancelBid` chiama `rpc_cancel_tourism_bid`
  RPC: 33_tourism_tenders.sql:353 — RPC non tocca il saldo → corretto cosi'
- riga 125 — `tourismTerminate` chiama `rpc_terminate_tourism_contract` poi `CE_money.addReputation`
  RPC: 33_tourism_tenders.sql:410 — RPC non tocca il saldo (aggiorna solo companies.reputation) → corretto cosi'
- riga 142 — `_tourismDailyTick` chiama `rpc_tourism_daily_tick` poi `CE_money.earn` (riga 145)
  RPC: 33_tourism_tenders.sql:530 — `UPDATE public.companies SET cash = cash + v_total_pay, liquid_assets = liquid_assets + v_total_pay WHERE user_id = v_uid;` → DOPPIO CONTEGGIO

## black_ops.js
- riga 83 — `shadowRefresh` chiama `rpc_get_shadow_targets` e `rpc_get_shadow_ops_log`
  RPC: 23_shadow_ops.sql:181, 203 — RPC non tocca il saldo → corretto cosi'
- riga 100 — `shadowExecuteOp` chiama `CE_money.spend` prima di `rpc_execute_shadow_op` (riga 102) e `CE_money.earn` su errore (riga 108)
  RPC: 23_shadow_ops.sql:83 — `UPDATE public.companies SET cash = cash - v_op_cost, liquid_assets = GREATEST(0, liquid_assets - v_op_cost) WHERE user_id = v_uid;` → DOPPIO CONTEGGIO
- riga 135 — `shadowUpgradeDefense` chiama `CE_money.spend` prima di `rpc_upgrade_shadow_defense` (riga 137) e `CE_money.earn` su errore (riga 139)
  RPC: 23_shadow_ops.sql:248 — `UPDATE public.companies SET cash = cash - v_cost, liquid_assets = GREATEST(0, liquid_assets - v_cost) WHERE user_id = v_uid;` → DOPPIO CONTEGGIO

## vip-clients.js
- nessun punto in cui si chiama una RPC del server e SUBITO DOPO si chiama CE_money.spend / CE_money.earn / _addCash (il file non effettua chiamate RPC dirette, i movimenti di cassa passano da CE_money e _vipSyncCash chiama solo syncCash) → corretto cosi'
