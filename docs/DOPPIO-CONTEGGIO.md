# Censimento Doppio Conteggio Saldo (Client CE_money vs Server RPC)
Data censimento: 2026-08-21 — File esaminati: alliances.js, hostile_takeover.js, infrastructure.js, b2b.js

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
