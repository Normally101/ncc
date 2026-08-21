# Censimento Doppio Conteggio (Server RPC vs Client Money)
Data: 21/08/2026 — File esaminati: nemesis.js, tourism.js, black_ops.js, vip-clients.js

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
