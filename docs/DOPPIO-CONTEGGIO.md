# Censimento Doppio Conteggio RPC / Client Money
Data: 2025-08-21
File esaminati: nemesis.js, tourism.js, black_ops.js, vip-clients.js

## nemesis.js
Nessun problema trovato:
- `_nemesisFundRival` (riga 73) chiama `rpc_nemesis_fund_rival` ma non invoca `CE_money` / `_addCash`.
- `_nemesisBribeVip` (riga 96) chiama `CE_money.spend` localmente senza invocare RPC.
Nessun punto in cui viene chiamata una RPC e subito dopo `CE_money.spend` / `CE_money.earn` / `_addCash`.
