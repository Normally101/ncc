# Economia server-authoritative — Spec & piano di migrazione

> Stato: **SPEC + SCAFFOLDING**. NON applicato a prod. NON cambia i guadagni live.
> File SQL associato: `42_economy_ledger_scaffold.sql` (idempotente, da rivedere PRIMA di girarlo).
> Contesto: chiude il **DEBITO DI SICUREZZA #1** tracciato in `HANDOFF.md` (economia client-authoritative → soldi infiniti).

## Il problema (oggi)
La cassa è decisa dal client; il server la rispecchia. Tre vie di minting:
1. **`game_saves` blob** — upsert diretto con `cash` arbitrario (`saveSystem.js`), letto come verità dal P2P.
2. **`rpc_sync_cash(v_cash)`** (`10_sync_cash.sql`) — SETta `companies.cash` al valore client (set assoluto).
3. **`rpc_add_driver_coins`** — coniava premium senza validazione (arginato da `41_*` con tetto 1M/chiamata, stopgap).

I trigger anti-cheat (`38_security_hardening.sql`) **loggano ma non bloccano** (`RETURN NEW`): un salto di cassa legittimo (offline, contratti, late-game) è indistinguibile da un cheat finché la **scala economica non è decisa** (vedi vault → *Decisioni Aperte #6*).

## Il modello target
**Il client non scrive MAI la cassa assoluta.** Ogni movimento è un **delta validato lato server** che passa per un **ledger append-only**.

- `cash_ledger` (append-only): ogni riga = un delta con `reason`, `source`, `balance_after`, `idempotency_key`. È l'audit trail + la sorgente di verità ricostruibile.
- `rpc_earn(delta, reason, source, idem)` / `rpc_spend(...)`: SECURITY DEFINER, validano segno + tetto **server-side per-reason** (catalogo in SQL, mai dal client), idempotenti su `idem`, aggiornano `companies.cash` e scrivono il ledger nella **stessa transazione**.
- `liquid_assets` e derivati → calcolati lato server, mai accettati dal client.
- Trigger `BEFORE UPDATE` su `companies.cash` che `RAISE EXCEPTION` se la cassa cambia **fuori** dalle RPC autorizzate (enforcement duro). ⚠️ Attivabile SOLO dopo aver migrato TUTTE le scritture cassa esistenti alle RPC — vedi fasi.

## Perché solo scaffolding ora
La **magnitudine dei tetti** dipende dalla scala economica legittima, ancora **indecisa**. Mettere tetti sbagliati bloccherebbe i guadagni veri (decisione già presa, `HANDOFF.md`). Quindi: predisponiamo l'infrastruttura (tabella + RPC + trigger template) **senza attivarla**, pronta da calibrare quando la scala è fissata.

## Fasi di migrazione (quando si decide la scala)
1. **Girare** `42_economy_ledger_scaffold.sql` su prod (crea tabella + RPC, inerti finché non chiamate).
2. **Calibrare** il catalogo tetti per-reason in `_econ_cap(reason)` con la scala economica reale.
3. **Migrare le scritture**: ogni `UPDATE companies SET cash = cash ± X` sparso negli SQL (province/immobili/P2P/aste/contratti…) e ogni mirror client (`rpc_sync_cash`) → passare per `rpc_earn`/`rpc_spend`. Censimento: `grep -rn "companies SET cash" *.sql`.
4. **Deprecare** `rpc_sync_cash` (set assoluto) e bloccare l'upsert di `cash` dal blob `game_saves` (separare lo stato di gioco dal saldo monetario; il saldo vive solo in `companies` + ledger).
5. **Attivare** il trigger `BEFORE UPDATE` di enforcement (de-commentare in `42_*`). Solo ora il minting client è impossibile.
6. **Stripe** (requisito futuro, `HANDOFF.md`): l'accredito coin reali passa solo da webhook firmato → `rpc_earn` con `source='stripe'`. Revocare `rpc_add_driver_coins` da `authenticated`.

## Cosa NON fare
- Non attivare il trigger di enforcement prima della fase 3 (romperebbe ogni guadagno legittimo).
- Non mettere tetti "al volo" senza la scala economica (falsi positivi sui salti legittimi).
- Non far decidere al client importi/quantità: solo `reason` → il server mappa il valore.

## Censimento siti `gameState.cash =`/`+=`/`-=` (6 agosto 2026)

Mappa di tutti i punti del codice che ancora scrivono `gameState.cash` direttamente, prodotta
per dare dati freschi alla fase 3 quando la scala economica verrà sbloccata (`grep -rn
'gameState\.cash\s*\(=[^=]\|[+-]=\)' --include='*.js'` → **119 occorrenze**, ognuna letta con
il contesto della funzione, non solo la riga). Nessun fix di codice qui: è solo l'inventario
che il debito #1 richiede tenere aggiornato.

**Metodo:** ogni sito è stato classificato leggendo se nella stessa funzione esiste già una
RPC che muta `companies.cash` server-side. Confermato leggendo per intero anche `serverState.js`
(righe 620-650, il commento dell'autore elenca esplicitamente il refactor pendente) e
verificando quali RPC-wrapper lì definiti (`hireDriver`, `fireDriver`, `buyInvestment`,
`toggleTelepass`, `takeLoan`, `repayLoan`, `unlockRegion`, `restCeo`, `startTrip`,
`claimTripReward`) sono davvero **chiamati** da qualche punto del gioco — nessuno lo è: esistono
lato server ma sono dead code lato client. Spot-check personale su 3 siti a campione
(`engine-rides.js:700`, `crypto.js:76`, `b2b.js:131`) conferma la classifica del subagent che
ha prodotto la scansione: nessun falso positivo/negativo trovato nei campioni verificati.

### GUARDED — mirror locale con guard `!ServerState?.isReady()`, già corretto (25 siti)
Il fix "doppia deduzione" del 6 agosto ha reso questi siti sicuri: la scrittura locale scatta
SOLO come fallback quando il sync server-authoritative non è ancora attivo; quando lo è, la
RPC è l'unica fonte di verità e la riga è un no-op.
`ui-staff.js:571,611` (rpc_buy_vehicle) · `p2p-render.js:419` (rpc_contribute_consorzio) ·
`p2p-render.js:447` (rpc_pay_don_carmine) · `black_ops.js:128,169` (rpc_execute_shadow_op,
rpc_upgrade_shadow_defense) · `showroom.js:721` (rpc_buy_vehicle) · `crypto.js:76,95,116,137`
(rpc_buy_crypto, rpc_sell_crypto, rpc_deposit_offshore, rpc_withdraw_offshore) ·
`p2p-market.js:146,199,246,279,294,427` (rpc_buy_market_car, rpc_contribute_holding_treasury,
rpc_list_company_ipo, rpc_buy_company_shares, rpc_sell_company_shares,
rpc_gdf_inspection_check) · `nemesis.js:123` (rpc_nemesis_bribe_vip) ·
`alliances.js:293,333` (rpc_create_alliance, rpc_donate_to_alliance) ·
`infrastructure.js:150` (rpc_buy_fuel_depot) · `hostile_takeover.js:149` (rpc_opa_buyback) ·
`b2b.js:131,152` (rpc_terminate_b2b_contract, rpc_b2b_daily_tick) ·
`tourism.js:158` (rpc_tourism_daily_tick).

### RPC-MIRROR — il motore di sync stesso (2 siti)
`serverState.js:156` (`_onCompanyChange`, applica il delta Realtime) e `serverState.js:208`
(`_bridgeToGameState`, overwrite completo da `_company.cash` al boot/reconnect). Non toccare:
sono l'infrastruttura che rende sicuri tutti i siti GUARDED sopra.

### FULLY-CLIENT-AUTHORITATIVE — debito #1, nessuna RPC coinvolta (91 siti)
Nessuna RPC scala/accredita cassa da nessuna parte in questi file per queste azioni: il client
resta l'unica fonte di verità finché non arriva una migrazione. Raggruppati per sottosistema
(riga = riga del match `gameState.cash`):
- **Guadagno corse** (`engine-rides.js:700,792,884`) — il flusso di cassa più grande del gioco.
  `rpc_start_trip`/`rpc_claim_trip_reward` esistono in `serverState.js` ma non sono mai chiamate.
- **Tick giornaliero** (`engine-daily.js:422,487,565,598,661,681,701,730,759,792,883,905,933,
  1010,1034,1042,1082`, 17 siti) — simulazione locale voluta, il risultato aggregato viene
  spinto una volta al giorno via `ServerState.syncCash` (push-up fire-and-forget, strategia di
  sync più grezza del pattern a delta usato altrove, non un bug).
- **Gestione autisti** (`engine-drivers.js:43,59,75,107,142`) — `ServerState.hireDriver` esiste
  ma è dead code.
- **Finanza** (`engine-finance.js:69,104,214,237,255,276,298,321,358,378,395,412,445,460`,
  14 siti: dividendi, prestiti, borsa, short-selling, lobby, venture) — `ServerState.takeLoan`/
  `repayLoan` esistono ma sono dead code.
- **Holding/CEMP/IPO** (`engine-holding.js:30,47,64,77,91,110,121`).
- **Flotta/leasing/mercato NPC** (`engine-fleet.js:62,182,205,221,235,252,311,325,389,412,430,
  446,485,508,509`, 15 siti).
- **Bandi corporate domestici** (`contracts.js:205,216,270,271,281`, distinti da B2B/turismo
  che sono già RPC-backed).
- **10 personaggi VIP client** (`vip-clients.js:53,79,138,211,291,355,540,561,640,643,659,722`,
  12 siti).
- **HQ** (`hq.js:157`) · **Eventi/motore centrale** (`engine.js:813,839,956,966,1217,1269,1378,
  1673,1876`) · **Ordini giornalieri** (`daily-orders.js:144`, ramo cash del reward, il ramo
  Driver Coins nella stessa funzione invece passa da `ServerState.addDriverCoins`).

### Esito verifica: nessun bug nuovo
A differenza del giro di fix del 6 agosto, **questo censimento non ha trovato nuovi siti
UNGUARDED-OPTIMISTIC** (scrittura locale + RPC concorrente sullo stesso saldo senza guard —
la classe di bug delle 12 doppie deduzioni già sistemate). I 91 siti FULLY-CLIENT-AUTHORITATIVE
non sono bug: sono semplicemente fuori dal perimetro della migrazione server-authoritative,
esattamente il debito #1 già noto. Nessuna azione di codice necessaria da questo censimento.
