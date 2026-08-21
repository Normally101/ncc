# Censimento doppio conteggio (RPC server vs CE_money client)
Data: 2026-08-21
File esaminati: alliances.js, hostile_takeover.js, infrastructure.js, b2b.js

## alliances.js
- riga 202 — `_alCreate` chiama `CE_money.spend` poi `rpc_create_alliance`
  RPC: non presente nei file .sql del repo (RPC non tocca il saldo → corretto cosi')
- riga 238 — `_alDonate` chiama `CE_money.spend` poi `rpc_donate_to_alliance`
  RPC: 54_fix_donate_to_alliance_cash_source_of_truth.sql:57 — `UPDATE public.companies SET cash = cash - p_amount::bigint WHERE user_id = v_uid;` → DOPPIO CONTEGGIO
