# Playtest report — 15 agosto 2026

Sessione di gioco completa su account nuovo (`qa.alpha@example.com`), da primo login a sweep di tutti i 31 tab, con strumentazione che intercetta ogni chiamata a `/rest/v1/rpc/` e ogni errore console. Serve a rispondere a una domanda precisa: **perché il gioco non sembra giocabile.**

Ambiente: `python3 -m http.server 8000` su `localhost:8000`, Supabase di produzione (`twstjbykstaioaahfqbe`, unico progetto esistente, conteneva solo l'account di Vlad).

**Risposta breve.** Il gioco non è rotto nel senso di "va in errore": lo sweep dei 31 tab ha prodotto **zero eccezioni JavaScript e zero RPC fallite**. È rotto in tre modi più insidiosi: (1) i soldi guadagnati sparivano a ogni reload, (2) il client non riceveva **nessun** aggiornamento dal server, (3) sei tab erano gusci vuoti perché i cataloghi non erano popolati. Più un problema di ritmo che nessun bugfix risolve.

---

## 1. Bug critici — trovati, corretti e verificati

### 1.1 Ogni incasso da corsa spariva al reload ⚠️ il ciclo centrale del gioco

`engine-rides.js` incrementava `gameState.cash` in tre punti (righe 700, 792, 884) senza **mai** chiamare `syncCash` — zero occorrenze in tutto il file. Il cash è server-authoritative: al boot `bridgeToGameState()` sovrascrive il locale con `companies.cash`.

Riprodotto dal vivo: dopo due corse completate, `game_saves.game_state.cash` = **923** ma `companies.cash` = **650**. Al reload il giocatore tornava a 650: **273 € di lavoro cancellati**. Succedeva a ogni sessione, a ogni giocatore, sull'azione più frequente del gioco.

**Fix** (`engine-rides.js`, `?v=10→11`): due `syncCash`, uno a fine `completeRide` (copre pagamento immediato e mancia Charmante) e uno dopo il loop di `checkActiveTrips` (copre i pagamenti differiti con una sola RPC per passaggio, non una per viaggio).
**Verifica:** `companies.cash` 811 = blob 811, valore sopravvive al reload. 2 test di regressione aggiunti (`test/rides/complete-ride.test.js`), suite **67/67**.

### 1.2 Il canale Realtime principale era completamente muto

Il client non riceveva **nessuna** modifica fatta dal server: comprando un veicolo il server addebitava correttamente €35.000 ma il giocatore continuava a vedere il saldo vecchio, a tempo indefinito. Idem per veicoli, viaggi attivi, immobili, prezzo carburante. Il canale si dichiarava regolarmente `joined`/`SUBSCRIBED`.

Causa isolata con un test A/B in browser:

| canale | binding | eventi ricevuti |
|---|---|---|
| `qa_only_companies` | solo `companies` | ✅ ricevuti |
| `qa_with_drivers` | `companies` + `drivers` | ❌ **nessuno** |

`drivers` non era nella publication `supabase_realtime`. In Supabase Realtime **un singolo binding non valido invalida tutti gli altri binding dello stesso canale, senza errori**. `serverState.js` registra 7 binding su un unico canale (`ce_game_events`), quindi la sola `drivers` mancante disattivava l'intera sincronizzazione di stato.

Il diff completo fra tabelle sottoscritte dal client e publication ha rivelato **9 tabelle mancanti**: `drivers`, `market_listings`, `company_shares`, `holding_members`, `consorzio_members`, `judicial_auctions`, `crypto_market`, `global_events`, `real_world_status`.

**Conseguenza economica, da valutare a parte:** `rpc_sync_cash` fa un **SET assoluto**. Se il client non viene mai informato degli addebiti del server, il `syncCash` successivo riscrive il valore locale più alto e **annulla l'addebito**. Con Realtime rotto, comprare un veicolo e poi completare una corsa poteva restituire il costo dell'auto. Il fix al Realtime chiude la finestra, ma il pattern "SET assoluto su un valore che il client potrebbe avere stantio" resta fragile di suo.

**Fix** (`60_fix_realtime_publication.sql`, applicata): `ALTER PUBLICATION ... ADD TABLE` idempotente per le 9 tabelle. Nessun DDL distruttivo.
**Verifica:** modifica server di −9.999 → il client la applica in pochi secondi. Prima del fix, identica modifica: nessun effetto.

### 1.3 Sei tab erano gusci vuoti — cataloghi mai popolati

Nove tabelle catalogo a **0 righe** pur avendo un seed `INSERT` scritto nelle migration. Effetto: **Crypto & Offshore, Real Estate, Regioni, Aste Giudiziarie, Politica/Decreti** completamente vuoti, prezzo carburante mai aggiornato, meteo senza dati.

Forensica (`pg_stat_user_tables`): `n_tup_ins > 0`, `n_tup_del = 0`, `n_live_tup = 0` — firma di un `TRUNCATE`, non di `DELETE`. **Responsabilità del reset dati-di-test del 14/08**: l'`HANDOFF.md` (righe 198-204) dichiarava "tabelle globali intatte" e "`judicial_auctions`/`server_decrees`: righe preservate". La dichiarazione era **inesatta** — erano vuote. È un errore mio della sessione precedente, non un difetto storico del progetto.

**Fix** (`59_reseed_global_catalogs.sql`, applicata): seed ripresi verbatim dalle migration originali.

| tabella | righe |
|---|---|
| `crypto_market` | 4 |
| `regions` | 20 |
| `real_estate_listings` | 13 |
| `vehicle_co2_rates` | 13 |
| `server_decrees` | 7 |
| `real_world_status` | 6 |
| `judicial_auctions` | 5 |
| `fuel_market` | 1 |
| `global_tension` | 1 |

Dopo il reseed quei tab si popolano: Real Estate 13 controlli, Regioni 19, Politica 15, Crypto 8, Aste 5 lotti.

---

## 2. Bug confermati e non corretti (richiedono una tua decisione)

### 2.1 La schermata "Fonda Azienda" è irraggiungibile — CRITICO per l'onboarding

Ogni nuovo giocatore riceve un'azienda chiamata letteralmente **"Chauffeur Empire"** (il titolo del gioco) con logo di default 👁️, e **non può rinominarla da nessuna parte**.

`auth.js:51-57` (Phase 1) crea la company incondizionatamente con il nome di default, quindi `hasCompanyRow` è già `true` quando la Phase 4 valuta `if (hasCompanyRow) … else showNewGameSetup()` (`auth.js:167-175`): il ramo che apre la schermata di fondazione (nome + 12 loghi + 8 colori) è **codice morto**, raggiungibile solo se `initCompany` fallisce due volte. `window._pendingCompanyName` è valorizzato **solo** da quella schermata, quindi mai. Nessuna funzione di rinomina esiste altrove (verificato su tutti i `.js`).

Il lavoro è già tutto scritto e funzionante — semplicemente non viene mai mostrato.

### 2.2 Il mercato VTK è rotto e finge di essere vuoto

`rpc_get_vtk_market_orders` **non esiste nel database** (404 `PGRST202`, chiamata due volte all'apertura del modale). `vtk-market.js:95` usa `if (!error && data)`, quindi l'errore viene ingoiato e il libro ordini renderizza vuoto: il giocatore conclude "non c'è nessun venditore" mentre la feature è non funzionante. All'utente non viene mostrato **nulla**.

Stesso pattern di ingoio silenzioso in `tourism.js:91`, `b2b.js:42`, `p2p-market.js:316`, `global_events.js:27` — vale la pena bonificarli tutti.

### 2.3 18 province su 23 non esistono

Confermato dal vivo: `rpc_add_province_influence` → **400 "Provincia non trovata: prov_civita"** durante una corsa normale. `_POI_TO_PROVINCE` in `engine.js` referenzia 23 province, il DB ne ha 5. Ogni corsa verso le altre 18 città fallisce silenziosamente l'assegnazione di influenza. Non l'ho seedato: non esistono dati di bilanciamento da nessuna parte e inventarli sarebbe game design, non QA.

### 2.4 La classifica pubblica è sempre vuota

La landing da sloggato interroga `companies` (`select company_name,cash,reputation`), ma la RLS su quella tabella è `user_id = auth.uid()` (policy `companies_select_own`): per un visitatore anonimo restituisce **0 righe senza errore**. Verificato in-page. La tabella giusta è `leaderboard`, che ha già la policy `Public leaderboard read` con `qual = true` per `anon`.

Risultato: ogni visitatore non registrato vede "Nessun dato disponibile" sotto il titolo "TOP CEO GLOBALI", accanto a statistiche hardcoded ("1402 giocatori attivi", "45.930 corse", "€1.2 Mld"). È la prima impressione del gioco.

Minori sulla stessa pagina: il link "ENTRA SU DISCORD — 1.500+ CEO" ha `href="#"`; il motore di gioco gira già sotto l'overlay di login (toast "Salvataggio completato" da sloggato) — l'overlay a z-index 9000 copre i click, quindi non è sfruttabile, ma è lavoro sprecato.

### 2.5 Il service worker può servire codice vecchio dopo un deploy

Durante il test il SW ha servito un `index.html` in cache: il tag diceva `?v=10` mentre il file su disco era già `?v=11`. **Il cache-bust `?v=N` non protegge se è `index.html` stesso a essere in cache.** Un giocatore con SW attivo può continuare a girare su codice vecchio dopo un fix — inclusi i due fix di oggi.

---

## 3. Il problema di ritmo — la risposta vera a "non sembra giocabile"

Nessuno di questi è un bug. Insieme sono la ragione per cui il gioco non si lascia giocare.

| fatto | misurato |
|---|---|
| Corse generate all'avvio | **zero** — `generatePOIRide` gira solo su `setInterval(5 min)` (`engine.js:915`); ogni altra chiamata dipende da investimenti/eventi/campagne che un giocatore nuovo non ha |
| Attesa della prima corsa | fino a **5 minuti** davanti a un Dispatch vuoto, subito dopo il climax dell'onboarding ("vai a dormire, i soldi arrivano da soli") |
| Durata di una corsa | `price × 0.4` minuti, cap 10–360 (`engine-rides.js:224`). Una standard da €187 dura **36 minuti reali** — misurata |
| Sblocco di tutti i tab | 25 corse. Con 1 autista: **~9 ore di tempo reale**, durante le quali quasi tutto è bloccato |
| Primo batch di bandi corporate | **2 giorni reali** — `CE_Contracts.dailyTick()` gira solo al cambio di giorno |
| Grind di sopravvivenza | 10 click da +€15 mentre in cassa ci sono già €650 dal premio login: è un cancello sul conteggio corse, non una sfida economica |

Nota UX correlata: con un autista libero l'auto-dispatch (ogni 600 ms) prende le corse all'istante, quindi la lista "Richieste in Arrivo" resta sempre a 0 e il bottone "Smista tutte" non ha mai nulla da smistare. L'unica schermata che il giocatore guarda nella prima ora è vuota per costruzione.

---

## 4. Sweep dei 31 tab

**Zero eccezioni JavaScript, zero RPC fallite** su tutti i tab. Tre "tab vuoti" del primo passaggio erano errori di misurazione miei, non difetti: `showroom`, `career` e `provinces` renderizzano in overlay a livello di `body` (`srm-overlay` 17 controlli, `career-modal` 2, War Room + mappa), non dentro `#tab-container`.

| stato | tab |
|---|---|
| Funzionanti con contenuto | home, corse, fleet, staff, hq, showroom, emails, b2b (12 contratti), tourism (21 bandi), infrastructure, store, auctions (5 lotti), realestate (13), crypto, invest (47 controlli), marketing, regions (19), politics (15), prestigio (31), career, help, ranking |
| Stato vuoto legittimo | market (nessun annuncio), nemesis (nessun VIP deluso), opa (nessun rivale), legal (nessuna sanzione), consorzi, shadow (0 target: serve un secondo giocatore), contracts (batch fra 2 giorni) |
| Gated by design | finance — "Finance Hub Bloccato: assumi un Elite Wealth Manager" |

Refusi rilevati: "0 sanzion**ei** in attesa" (`ui-legal.js`).

---

## 5. Verificato e sano

- **Tutorial Vittorio**: 12 step, tutti i bottoni rispondono, zero errori. (L'`actionGate` dello step Dispatch, `tutorial.js:62`, non blocca: si arriva in fondo senza completare una corsa.)
- **Survival + onboarding**: 10 corse manuali, transizione di fase corretta a `restricted`, evento "SVEGLIATI, SCHIAVO", assunzione gratuita del Ragazzo di Quartiere che eredita la berlina starter (`driver.assignedCarId`). Nessun soft-lock.
- **Contabilità del cash**: 0 → +500 premio login Giorno 1 → +150 dalle 10 corse = 650, server allineato. Corretta.
- **Pipeline dispatch**: spawn → assegnazione → viaggio → pagamento, con `rpc_pay_majority_dividend` e `rpc_pay_fuel_levy` a 200.
- **Acquisto veicolo**: `rpc_buy_vehicle` addebita **esattamente** il prezzo di listino (€35.000 per la Nexus H-Line) su `companies.cash`. Server-authoritative corretto.
- **Le 7 RPC delle alleanze** che non esistono nel repo (`rpc_create_alliance`, `rpc_join_alliance`, `rpc_leave_alliance`, `rpc_disband_alliance`, `rpc_post_alliance_chat`, `rpc_kick_member`, `rpc_set_member_role`) **esistono in produzione**: la feature funziona, ma la migration non è mai stata committata → il sottosistema è oggi impossibile da revisionare da codice. **Vanno dumpate e messe in repo.**
- **`syncCash` arrotonda** (`Math.round`) prima di scrivere sul `bigint`: il cash frazionario prodotto dal tick giornaliero (stipendi `/30`) non causa problemi al confine col server.

---

## 6. Cosa resta aperto

Non svolto in questa sessione, in ordine di valore:

1. **Test multi-account** (P2P auto A→B, alleanze, azioni/IPO, aste competitive, OPA, Shadow Ops, voto decreti). Il secondo account `qa.beta` è creato ma non usato: la diagnosi del Realtime ha assorbito il tempo previsto. È il blocco più importante da fare adesso, perché il fix al Realtime cambia il comportamento di tutte queste feature.
2. **UI morta** già identificata staticamente e non riconfermata a runtime: app Mobile Dispatcher, overlay Smart Hub con 25 tile, tab `lifestyle` (raggiungibile **solo** dallo Hub morto), modale leasing, pannello eventi globali, bottone sync cartella.
3. **RPC senza cron**: nessun `pg_cron` risulta schedulato → le aste non si chiudono mai (`rpc_resolve_auction` mai chiamata, denaro impegnato potenzialmente bloccato), affitti immobiliari mai accreditati, reset VTK giornaliero assente, contratti turismo mai scaduti.
4. **`gameState.activeDynamicEvent` mai resettato** e **moltiplicatori HQ non server-authoritative** — noti come `FAIL` in `docs/`, non toccati.

---

## Modifiche di questa sessione

| file | modifica |
|---|---|
| `engine-rides.js` | 2 × `syncCash` sul pagamento corse (`?v=10→11` in `index.html`) |
| `test/rides/complete-ride.test.js` | 2 test di regressione — suite 67/67 |
| `59_reseed_global_catalogs.sql` | reseed 9 cataloghi globali (applicata) |
| `60_fix_realtime_publication.sql` | 9 tabelle aggiunte alla publication Realtime (applicata) |

Account di test creati e da rimuovere a fine ciclo: `qa.alpha@example.com`, `qa.beta@example.com`. L'account di Vlad non è stato toccato.
