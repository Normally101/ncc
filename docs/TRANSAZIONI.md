# Mappa Completa delle Transazioni Economiche e Validazione Server

> **Documento di analisi per la transizione verso un'architettura Server-Authoritative.**  
> Scopo: mappare ogni singolo flusso monetario del gioco, evidenziare lo stato attuale di sincronizzazione vs validazione, documentare cosa controllano le RPC esistenti e cosa lasciano scoperto, e fornire una graduatoria di priorità di intervento basata sull'impatto economico e sul rischio di cheating.

---

## Indice e Perimetro di Copertura

Questo censimento copre **tutte le 12 macro-aree economiche** di *Chauffeur Empire* per un totale di oltre **50 azioni transazionali**:

1. [Valuta Premium (Driver Coins) & Store](#1-valuta-premium-driver-coins--store) — **100% coperto**
2. [Flotta, Garage & Manutenzione](#2-flotta-garage--manutenzione) — **100% coperto**
3. [Personale, Autisti & Accademia](#3-personale-autisti--accademia) — **100% coperto**
4. [Corse, Viaggi & Servizio NCC](#4-corse-viaggi--servizio-ncc) — **100% coperto**
5. [Aste Giudiziarie & Mercato P2P Veicoli](#5-aste-giudiziarie--mercato-p2p-veicoli) — **100% coperto**
6. [Finanza, Borsa, Prestiti & Lobbying](#6-finanza-borsa-prestiti--lobbying) — **100% coperto**
7. [Holding, Azioni Societarie P2P & OPA Ostili](#7-holding-azioni-societarie-p2p--opa-ostili) — **100% coperto**
8. [Immobili, Rendite & Guerra delle Province](#8-immobili-rendite--guerra-delle-province) — **100% coperto**
9. [Contratti B2B & Appalti Turismo](#9-contratti-b2b--appalti-turismo) — **100% coperto**
10. [Marketing & Gestione CEO](#10-marketing--gestione-ceo) — **100% coperto**
11. [Eventi Narrativi, Clienti VIP, Quests & Multe](#11-eventi-narrativi-clienti-vip-quests--multe) — **100% coperto**
12. [Infrastrutture, Alleanze, Sindacato & Shadow Ops](#12-infrastrutture-alleanze-sindacato--shadow-ops) — **100% coperto**
13. [Graduatoria di Priorità per la Migrazione](#13-graduatoria-di-priorità-per-la-migrazione)

---

## Concetti Chiave: Divergenza vs Imbroglio (Client-Trust)

- **La Protezione Attuale (money.js + syncCash):**  
  Risolve la *divergenza accidentale*: impedisce che ricaricando la pagina un acquisto locale venga annullato e i soldi tornino indietro. `CE_money.spend/earn` aggiorna lo stato locale e invia il nuovo saldo tramite `ServerState.syncCash` (`rpc_sync_cash`).
- **La Vulnerabilità Strutturale (Mancanza di Validazione):**  
  Il server tratta il browser come fonte di verità sul saldo (`companies.cash = v_cash`). Un utente malevolo che modifica JavaScript in console o invia parametri manipolati alle RPC può:
  1. Modificare arbitrariamente il proprio saldo contanti.
  2. Acquistare beni impostando il prezzo a €0 o €1 nelle RPC che accettano `v_price` dal client.
  3. Vendere veicoli o asset a prezzi astronomici nelle RPC che accettano `v_price` dal client.
  4. Coniare valuta premium (`driverCoins`) chiamando direttamente RPC prive di verifica dei pagamenti reali.

---

## 1. Valuta Premium (Driver Coins) & Store

### 1.1 Acquisto Pacchetti Driver Coins (Store Premium)
- **Come si muove oggi:** `CE_money.earnDC(amount)` → `ServerState.addDriverCoins(amount)` → RPC `rpc_add_driver_coins(p_amount, p_item_id)`.
- **Cosa controlla la RPC (`17_executive_club.sql`, `41_cap_driver_coins.sql`, `43_ratelimit_driver_coins.sql`):**  
  - Controlla autenticazione `auth.uid()` ed esistenza azienda.
  - Verifica `p_amount > 0` e applica un tetto per singola chiamata (`p_amount <= 1.000.000 DC`).
  - Applica un rate-limit (es. 10 chiamate/minuto).
  - Logga l'accredito nella tabella `coin_transactions`.
- **Cosa NON controlla:**  
  - **Non verifica alcuna ricevuta di pagamento reale** (Stripe, Apple IAP, Google Play Billing).
  - Chiunque chiami l'RPC dalla console di Supabase o dal browser ottiene Driver Coins gratis e infiniti.
- **Gravità Imbroglio:** **CRITICA / MASSIMA (Danno Economico Diretto)**. I Driver Coins sono la valuta premium comprata con denaro reale. Permettere il minting non autorizzato distrugge la monetizzazione del gioco e svaluta ogni acquisto legittimo.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - `rpc_add_driver_coins` deve essere revocata da `authenticated` (`REVOKE EXECUTE ... FROM authenticated`).
  - L'accredito deve avvenire **esclusivamente** tramite un webhook backend server-to-server (es. Stripe Webhook con firma crittografica HMAC verificata) che chiama l'RPC con credenziali `service_role`.

### 1.2 Spesa Driver Coins (Booster, Cosmetici, Executive Club)
- **Come si muove oggi:** `CE_money.spendDC(cost)` → `ServerState.spendDriverCoins(itemId, cost)` → RPC `rpc_ec_spend(p_item_id, p_amount)`.
- **Cosa controlla la RPC (`17_executive_club.sql`):**  
  - Controlla autenticazione e lock `FOR UPDATE` su `companies`.
  - Verifica `p_amount > 0`.
  - Verifica `companies.driver_coins >= p_amount`.
  - Deduce `driver_coins`, aggiorna `companies` e logga in `coin_transactions`.
- **Cosa NON controlla:**  
  - Non valida se `p_item_id` costa effettivamente `p_amount` su un catalogo prezzi server-side (un utente può comprare un item da 5.000 DC passando `p_amount = 1`).
- **Gravità Imbroglio:** **ALTA**. Consente di ottenere vantaggi premium pagando frazioni di coin.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - La RPC deve accettare solo `p_item_id`. Il server consulta la tabella/catalogo dei prezzi ufficiali degli item Executive Club, deduce il costo reale associato all'item e restituisce l'effetto sbloccato.

### 1.3 Acquisto Automazione HR (`rpc_buy_hr_automation`)
- **Come si muove oggi:** `ServerState.buyHRAutomation(cost, days)` → RPC `rpc_buy_hr_automation(v_cost_in_coins, v_days)`.
- **Cosa controlla la RPC (`12_hr_automation.sql`):**  
  - Verifica saldo `driver_coins >= v_cost_in_coins`.
  - Aggiorna `companies.hr_automation_expires_at` estendendo la data di scadenza.
- **Cosa NON controlla:**  
  - Non valida il rapporto costo/giorni sul listino server: accetta `v_cost_in_coins` passato dal client (es. 1 coin per 365 giorni).
- **Gravità Imbroglio:** **MEDIA-ALTA**. Elude il costo ricorrente dell'automazione del personale.
- **Cosa dovrebbe controllare:**  
  - Ricevere solo il pacchetto richiesto (es. `tier = '7_days'`), calcolare server-side costo (es. 50 DC) ed estensione temporale (+7 giorni).

---

## 2. Flotta, Garage & Manutenzione

### 2.1 Acquisto Veicolo da Concessionario / Showroom
- **Come si muove oggi:** `showroom.js` esegue `CE_money.spend(total, 'showroom_buy_vehicle')` e opzionalmente chiama `ServerState.buyVehicle(...)` (`rpc_buy_vehicle`).
- **Cosa controlla la RPC (`01_mmo_migration.sql`):**  
  - Controlla autenticazione e blocco riga con `FOR UPDATE`.
  - Verifica `v_price >= 0` e `companies.cash >= v_price`.
  - Scala `v_price` da `companies.cash` e inserisce il veicolo in `public.vehicles`.
- **Cosa NON controlla:**  
  - Non valida `v_model_id` rispetto a un listino prezzi ufficiale del veicolo. Il client può passare un'auto da €300.000 con `v_price = 1`.
  - Se l'acquisto avviene solo via `CE_money.spend` (senza `rpc_buy_vehicle`), l'auto viene creata solo nel blob locale e la cassa sincronizzata tramite `syncCash`.
- **Gravità Imbroglio:** **MEDIA-ALTA**. Permette di riempire il garage di auto di lusso a costo quasi nullo, accelerando il progresso di gioco.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - Ricevere solo `v_model_id`. Il server legge il prezzo base dalla tabella di catalogo `vehicle_models`, applica eventuali sconti legali/holding verificati server-side, preleva il prezzo calcolato e inserisce il veicolo.

### 2.2 Vendita Veicolo Usato
- **Come si muove oggi:** `engine-fleet.js` / `ui-fleet.js` chiamano `ServerState.sellVehicle(id, price)` → RPC `rpc_sell_vehicle(v_vehicle_id, v_price)` oppure `CE_money.earn(price)`.
- **Cosa controlla la RPC (`09_provinces_realestate_fuel.sql`, modificata in `49_lockdown_critical_cash_rpcs_scaffold.sql`):**  
  - Controlla che il veicolo esista, appartenga all'azienda e sia in stato `IDLE`.
  - Controlla `v_price >= 0` e `v_price <= 25.000.000` (cap di sicurezza).
  - Elimina il veicolo da `vehicles` e accredita `v_price` su `companies.cash`.
- **Cosa NON controlla:**  
  - Il prezzo esatto di vendita: un'utilitaria usata e danneggiata può essere venduta a €25.000.000 (il tetto massimo ammesso) invece del suo valore reale di €5.000.
- **Gravità Imbroglio:** **ALTA (Fabbrica di Denaro Infinito)**. Permette a un utente di comprare un'auto economica e rivenderla istantaneamente al cap massimo di 25 milioni di euro.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - Il server calcola il valore residuo in base a: prezzo di listino del modello, km percorsi, condizione meccanica (`condition`), carrozzeria e usura. Il parametro `v_price` non deve essere accettato dal client.

### 2.3 Riparazione Carrozzeria e Gomme
- **Come si muove oggi:** `engine.js:payToRepairCar` calcola il costo tramite formula `repairCostFor()` e chiama `ServerState.repairVehicle(carId, cost)` / `CE_money.spend`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:732`):**  
  - Verifica autenticazione e lock dell'azienda.
  - Verifica `v_cost >= 0` e fondi sufficienti `companies.cash >= v_cost`.
  - Verifica che il veicolo esista e appartenga all'azienda.
  - **Verifica lo stato del veicolo:** deve essere `IDLE` o `MAINTENANCE` (rifiuta veicoli in corsa).
  - Scala `v_cost` da `companies.cash`, ripristina `condition = 100`, `tire_pressure = 100` e imposta `status = 'IDLE'`.
- **Cosa NON controlla:**  
  - Non calcola il costo di riparazione server-side: si fida del valore `v_cost` passato dal client (il client può passare `v_cost = 0`).
- **Gravità Imbroglio:** **BASSA-MEDIA**. Consente riparazioni gratuite permanenti.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - Calcolare il costo sul server: `costo = (100 - condition) * costo_unitario_tier + (100 - tire_pressure) * costo_gomma`.

### 2.4 Rifornimento Carburante e Cambio Gomme Singolo
- **Come si muove oggi:** `ServerState.refuelVehicle(id, fuelAmount, cost)` → RPC `rpc_refuel_vehicle(v_vehicle_id, v_fuel_amount, v_cost)`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:688`):**  
  - Controlla proprietà del veicolo, `v_fuel_amount > 0`, `v_cost >= 0`, fondi sufficienti.
  - Deduce `v_cost`, incrementa `fuel_level` clampato a 100.
- **Cosa NON controlla:**  
  - Non controlla il prezzo unitario del carburante rispetto alla tabella `fuel_market` né la capacità del serbatoio del modello.
- **Gravità Imbroglio:** **BASSA**. Rifornimenti a costo zero.
- **Cosa dovrebbe controllare:**  
  - Calcolare il costo leggendo l'ultimo `price_eur` da `fuel_market` moltiplicato per i litri effettivi necessari al pieno.

### 2.5 Upgrade Veicolo & Telepass
- **Come si muove oggi:** `buyVehicleUpgrade` / `toggleTelepass` → RPC `rpc_buy_vehicle_upgrade` / `rpc_toggle_telepass`.
- **Cosa controllano le RPC (`02_mmo_rpcs_extension.sql:560, 608`):**  
  - Verificano proprietà del veicolo e stato `IDLE`.
  - Verificano che l'upgrade non sia già presente nell'array `upgrades`.
  - Verificano fondi `cash >= v_price`.
- **Cosa NON controllano:**  
  - Il catalogo del prezzo dell'upgrade o del costo del Telepass (il client può inviare `v_price = 0`).
- **Gravità Imbroglio:** **BASSA-MEDIA**.
- **Cosa dovrebbe controllare:**  
  - Prezzi fissati in un catalogo server (`upgrade_catalog`).

### 2.6 Gestione Depositi Flotta (Carburante & Pneumatici all'Ingrosso, Hub)
- **Come si muove oggi:** In `engine-fleet.js` (`buyFuelForDepot`, `upgradeFuelDepot`, `buyTiresForDepot`, `emergencyRefuel`, `buyHub`, `sellHub`) si muovono via `CE_money.spend` / `CE_money.earn`.
- **Cosa controlla lato server:**  
  - **Nessuna RPC dedicata.** Il movimento passa interamente tramite `CE_money` e viene salvato nel blob o sincronizzato con `rpc_sync_cash`.
- **Gravità Imbroglio:** **MEDIA**. Permette di accumulare scorte infinite di carburante o pneumatici e possedere hub gratis.
- **Cosa dovrebbe controllare una RPC sicura:**  
  - Una tabella `company_hubs` / `company_depots` con capacità massima, livello serbatoio, controllo fondi atomico all'acquisto e rimborso parziale calcolato dal server alla rivendita.

---

## 3. Personale, Autisti & Accademia

### 3.1 Assunzione Autista
- **Come si muove oggi:** `ServerState.hireDriver(name, salary, tier)` → RPC `rpc_hire_driver` oppure `engine-drivers.js:hireDriver` via `CE_money.spend(cost, 'hire_driver')`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:478`):**  
  - Verifica autenticazione, tier valido (`STANDARD`, `BUSINESS`, `VIP`, `ULTRA`), stipendio `v_salary >= 0`.
  - Calcola il costo di assunzione come `v_salary * 2`.
  - Verifica `companies.cash >= v_hiring_cost`, scala l'importo e inserisce la riga in `public.drivers`.
- **Cosa NON controlla:**  
  - Non controlla se lo stipendio `v_salary` è congruo con il `tier` dichiarato (un giocatore può assumere un autista `ULTRA` dichiarando stipendio €0 e pagando €0 di assunzione).
- **Gravità Imbroglio:** **MEDIA**. Consente di creare un esercito di autisti top-tier con stipendio zero.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - Il server definisce gli stipendi minimi/base per tier (es. STANDARD €2.000, ULTRA €8.000) e la formula per i costi di assunzione.

### 3.2 Licenziamento Autista
- **Come si muove oggi:** `ServerState.fireDriver(id)` → RPC `rpc_fire_driver(v_driver_id)`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:518`):**  
  - Verifica proprietà dell'autista e stato `AVAILABLE` (blocca se è in corsa).
  - Elimina l'autista dalla tabella `drivers`.
- **Cosa NON controlla:** Nessun movimento economico (nessun TFR o liquidazione attualmente prevista).
- **Gravità Imbroglio:** **NULLA**.

### 3.3 Gestione Stress, Scioperi, Bonus & Corsi Academy
- **Come si muove oggi:** In `engine-drivers.js` (`driverBonus`, `payStressClear`, `resolveStrike`, `startAcademyCourse`) tutti i movimenti avvengono esclusivamente con `CE_money.spend(..., motivo)`.
- **Cosa controlla lato server:**  
  - **Nessuna RPC dedicata.** La spesa viene inviata via `rpc_sync_cash`.
- **Gravità Imbroglio:** **BASSA-MEDIA**. Consente di azzerare lo stress degli autisti o risolvere scioperi senza spendere budget.
- **Cosa dovrebbe controllare una RPC sicura:**  
  - RPC dedicate `rpc_driver_action(driver_id, action_type)` che verificano lo stato dell'autista, deducono il costo calcolato dal server e applicano il beneficio (es. stress = 0, fine sciopero, skill aumentata).

---

## 4. Corse, Viaggi & Servizio NCC

### 4.1 Registrazione Inizio Corsa
- **Come si muove oggi:** `ServerState.startTrip(vehicleId, driverId, endCity, rewardCash, durationMs)` → RPC `rpc_start_trip`.
- **Cosa controlla la RPC (`01_mmo_migration.sql`):**  
  - Verifica proprietà di veicolo e autista, e che entrambi siano `IDLE` / `AVAILABLE`.
  - Verifica `v_reward >= 0` e `v_duration_ms > 0`.
  - Imposta veicolo su `IN_SERVICE` e autista su `DRIVING`.
  - Inserisce la riga in `active_trips` con `end_time = now() + (v_duration_ms || ' milliseconds')::interval`.
- **Cosa NON controlla:**  
  - **Il compenso della corsa (`v_reward`) e la durata (`v_duration_ms`) sono interamente decisi dal client.** Un utente può inviare `v_reward = 10.000.000` e `v_duration_ms = 1000` (1 secondo).
- **Gravità Imbroglio:** **CRITICA (Stampa di Denaro Illimitata)**. È il punto di ingresso principale per falsificare i guadagni delle corse e generare miliardi in pochi secondi.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - La RPC deve ricevere solo `start_city`, `end_city`, `vehicle_id`, `driver_id` e `route_type`.
  - Il server calcola la distanza reale in km dalla tabella distanze, determina la durata minima in base alla velocità media e calcola la tariffa autoritativa (tariffa base per classe veicolo + km * tariffa chilometrica + moltiplicatori meteo/reputazione verificati dal server).

### 4.2 Riscossione Compenso Corsa (Claim)
- **Come si muove oggi:** `ServerState.claimReward(tripId)` → RPC `rpc_claim_trip_reward(v_trip_id)` (oppure in locale `engine-rides.js` via `CE_money.earn`).
- **Cosa controlla la RPC (`01_mmo_migration.sql`, `16_territory_war.sql`):**  
  - Verifica che il viaggio appartenga all'azienda dell'utente.
  - Verifica che il viaggio sia concluso (`now() >= end_time`).
  - Applica la tassa di transito della provincia (`_apply_province_transit_tax`).
  - Accredita `reward_cash - tax` su `companies.cash`.
  - Libera veicolo e autista riportandoli a `IDLE` / `AVAILABLE` e aggiorna la loro città attuale (`current_city = end_city`).
  - Elimina la riga da `active_trips` (impedisce doppio claim).
- **Cosa NON controlla:**  
  - Poiché l'accredito si basa su `active_trips.reward_cash`, se il valore è stato truccato all'avvio (in `rpc_start_trip`), il server accredita l'importo falsificato.
- **Gravità Imbroglio:** **CRITICA (in combinazione con 4.1)**.
- **Cosa dovrebbe controllare:**  
  - La chiusura è già ben strutturata (atomica, anti-doppio claim con lock/delete). La vulnerabilità risiede a monte nella creazione della corsa.

### 4.3 Mance & Eventi Durante la Corsa
- **Come si muove oggi:** In `engine-rides.js` (`charmante_tip`, bonus vari) si usa `CE_money.earn(bonus, ...)`.
- **Cosa controlla lato server:** Nessuna RPC.
- **Gravità Imbroglio:** **BASSA**.

---

## 5. Aste Giudiziarie & Mercato P2P Veicoli

### 5.1 Offerta su Asta Giudiziaria
- **Come si muove oggi:** `auctions.js` → RPC `rpc_place_auction_bid(v_auction_id, v_amount)`.
- **Cosa controlla la RPC (`62_aste_ciclo_di_vita.sql`):**  
  - Verifica autenticazione e che l'asta sia `open` e non scaduta.
  - Verifica `v_amount >= min_bid` e `v_amount <= 100.000.000` (cap anti-spike).
  - **Calcola i fondi già impegnati:** somma le offerte attive dell'utente su tutte le altre aste aperte e verifica `cash >= impegnato + v_amount`.
  - Applica rate-limit anti-spam (max 1 offerta ogni 10 secondi per asta).
  - Verifica che l'offerta superi la precedente offerta massima (`v_top_bid`).
  - Registra l'offerta con upsert su `judicial_bids`.
- **Cosa NON controlla:** Il saldo contanti non viene congelato immediatamente in un escrow table dedicato, ma la formula `cash >= impegnato + amount` impedisce offerte scoperte.
- **Gravità Imbroglio:** **BASSA (Modulo Molto Robusto)**. L'implementazione attuale in `62_` è tra le migliori del sistema.

### 5.2 Risoluzione e Riscossione Asta Giudiziaria
- **Come si muove oggi:** Schedulata da cron server `_process_judicial_auctions` → `rpc_resolve_auction(v_auction_id)` per l'assegnazione, e `rpc_claim_auction(v_auction_id)` per il riscatto da parte del vincitore.
- **Cosa controlla la RPC (`62_aste_ciclo_di_vita.sql`):**  
  - In fase di risoluzione: scorre le offerte dall'alto verso il basso; se il primo offerente non ha liquidità sufficiente al momento della chiusura, passa all'offerta successiva valida. Deduce il cash direttamente dal vincitore.
  - In fase di riscatto (`rpc_claim_auction`): controlla `claimed_at IS NULL` con `FOR UPDATE` (anti-duplicazione), accredita eventuali cash container direttamente su `companies.cash` e restituisce i dati del veicolo per l'inserimento in flotta.
- **Gravità Imbroglio:** **BASSA**. Modulo blindato lato cassa. (Unica debolezza: la scheda tecnica del veicolo viene instanziata nel client in `gameState.fleet`).

### 5.3 Compravendita Veicoli P2P (Mercato Giocatori)
- **Come si muove oggi:** Vendita con `rpc_list_car_for_sale`, acquisto con `rpc_buy_market_car(v_listing_id)`.
- **Cosa controlla la RPC (`08_mmo_p2p_marketplace.sql`, `52_fix_p2p_sindacato_cash_source_of_truth.sql`):**  
  - Verifica inserzione non scaduta e lock `FOR UPDATE`.
  - Impedisce acquisto della propria stessa auto (`seller_user_id != buyer_id`).
  - **Lock ordinato anti-deadlock** su compratore e venditore in `companies`.
  - Verifica fondi compratore `buyer_cash >= ask_price`.
  - Calcola la tassa di sistema del 5% (fee anti-inflazione).
  - Trasferisce i fondi in modo atomico: `-ask_price` al compratore, `+(ask_price - 5%)` al venditore.
- **Cosa NON controlla:** Non c'è controllo sul prezzo inserito dal venditore: due giocatori complici o due account dello stesso utente possono trasferirsi denaro vendendo un'auto base a prezzi fuori mercato (es. 50 milioni) per fare money-transfer / laundering tra account.
- **Gravità Imbroglio:** **MEDIA-ALTA (Trasferimento Fondi / Multiboxing)**.
- **Cosa dovrebbe controllare:**  
  - Un price corridor (min/max) basato sul valore stimato dell'auto (es. non oltre ±50% del valore di perizia) per impedire il passaggio illecito di fondi tra account secondari.

---

## 6. Finanza, Borsa, Prestiti & Lobbying

### 6.1 Accensione Prestito Bancario
- **Come si muove oggi:** `ServerState.takeLoan(principal, rate, dailyPayment)` → RPC `rpc_take_loan`.
- **Cosa controlla la RPC (`49_lockdown_critical_cash_rpcs_scaffold.sql`):**  
  - Verifica `principal > 0`, `daily_payment > 0`, `interest_rate >= 0`.
  - Limite massimo di 3 prestiti simultanei attivi.
  - **Credit Score Server-Side:** calcola uno score da 300 a 900 basato su reputazione, liquidità e debito pregresso, determinando un fido massimo invalicabile (da €100.000 a €5.000.000).
  - Rifiuta la richiesta se il debito totale supera il fido.
  - Accredita `v_principal` su `companies.cash` e inserisce la riga in `company_loans`.
- **Cosa NON controlla:**  
  - Il tasso di interesse e la rata giornaliera sono passati dal client: un utente può impostare un tasso dello 0% e una rata di €1 al giorno per un prestito da €5.000.000.
- **Gravità Imbroglio:** **MEDIA**. Ottenere 5 milioni a tasso zero con rimborso simbolico.
- **Cosa dovrebbe controllare la RPC sicura:**  
  - Ricevere solo l'importo richiesto `v_principal`. Il server calcola il tasso di interesse ufficiale in base al Credit Score e definisce la rata ammortizzata su base standard (es. piano a 30 o 60 giorni).

### 6.2 Rimborso Prestiti & Rata Giornaliera
- **Come si muove oggi:** `ServerState.repayLoan(loanId, amount)` → RPC `rpc_repay_loan(v_loan_id, v_amount)` e tick giornaliero tramite `rpc_collect_daily_costs`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:410, 798`):**  
  - Verifica proprietà del prestito e fondi disponibili.
  - Scala il pagamento da `companies.cash` e riduce `remaining`. Se `remaining = 0` elimina il prestito.
- **Gravità Imbroglio:** **BASSA**.

### 6.3 Borsa Simulata, Short Selling, Broker & Venture Capital
- **Come si muove oggi:** In `engine-finance.js` (`buyStocks`, `sellStocks`, `stockDividends`, `shortSell`, `coverShort`, `brokerInvestment`, `brokerPayout`, `acquireVentureStake`, `divestVentureStake`, `ventureCapitalDividend`) si usano solo `CE_money.spend` ed `CE_money.earn`.
- **Cosa controlla lato server:**  
  - **Nessuna RPC.** Tutti i titoli azionari fittizi (es. Ferrari, ENI simulati), le posizioni short e i broker vivono nello stato locale JS e sincronizzano la cassa via `rpc_sync_cash`.
- **Gravità Imbroglio:** **ALTA**. Un utente può comprare azioni simulate, modificare via devtools il prezzo del titolo a 100x e chiamare `sellStocks()` per farsi accreditare centinaia di milioni via `syncCash`.
- **Cosa dovrebbe controllare una RPC sicura:**  
  - Una tabella server `market_equities` con i prezzi di borsa aggiornati da un cron e una tabella `company_portfolio` che gestisce posizioni, acquisti e vendite autoritative.

### 6.4 Donazioni Lobby Politica & Approvazione Leggi
- **Come si muove oggi:** In `engine-finance.js` (`lobby_donation`, `pass_lobby_law`) via `CE_money.spend`.
- **Cosa controlla lato server:** Nessuna RPC.
- **Gravità Imbroglio:** **BASSA**.

---

## 7. Holding, Azioni Societarie P2P & OPA Ostili

### 7.1 Creazione Holding & Contributo Tesoreria
- **Come si muove oggi:** `p2p-market.js` → RPC `rpc_create_holding`, `rpc_contribute_holding_treasury`.
- **Cosa controlla la RPC (`08_mmo_p2p_marketplace.sql`, `52_fix_p2p_sindacato_cash_source_of_truth.sql`):**  
  - Verifica fondi `companies.cash >= fee` per la creazione della holding.
  - Per il contributo: deduce cash dal membro e lo aggiunge a `holding_treasury`.
- **Gravità Imbroglio:** **BASSA-MEDIA**.

### 7.2 Quotazione in Borsa (IPO) & Compravendita Azioni Giocatori
- **Come si muove oggi:** `rpc_list_company_ipo`, `rpc_buy_company_shares(v_listing_id, v_qty)`, `rpc_sell_company_shares`.
- **Cosa controlla la RPC (`52_fix_p2p_sindacato_cash_source_of_truth.sql`):**  
  - Lock ordinato `FOR UPDATE` su compratore ed emittente.
  - Verifica disponibilità azioni residue in `company_shares`.
  - Verifica liquidità compratore `buyer_cash >= price * qty`.
  - Trasferimento atomico: `-totale` dal compratore, `+totale` all'azienda emittente.
  - Aggiornamento prezzo dell'azione (price dynamics) e inserimento in `share_holdings`.
- **Cosa NON controlla:** Non c'è controllo sulla solvibilità sottostante dell'azienda emittente rispetto al prezzo impostato in fase di IPO (rischio pump & dump concertato tra giocatori).
- **Gravità Imbroglio:** **MEDIA-ALTA (Manipolazione Mercato Finanziario P2P)**.
- **Cosa dovrebbe controllare:**  
  - Validazione server-side del valore patrimoniale netto (NAV) dell'azienda prima di ammettere la quotazione IPO.

### 7.3 Dividendi Azionari & OPA Ostile (Takeover)
- **Come si muove oggi:** `rpc_daily_dividends()` e `27_hostile_takeovers.sql` (`rpc_pay_majority_dividend`, `rpc_opa_buyback`).
- **Cosa controllano le RPC:**  
  - `rpc_daily_dividends` distribuisce pro-quota i dividendi scalando dal cash dell'emittente verso gli azionisti.
  - Le RPC di OPA controllano la quota di maggioranza e scalano il buyback/dividendo con lock su `companies`.
- **Gravità Imbroglio:** **MEDIA**.

---

## 8. Immobili, Rendite & Guerra delle Province

### 8.1 Acquisto Immobili a Reddito (Real Estate)
- **Come si muove oggi:** `ServerState.buyRealEstate(listingId)` → RPC `rpc_buy_real_estate(v_listing_id)`.
- **Cosa controlla la RPC (`09_provinces_realestate_fuel.sql:197`):**  
  - Verifica esistenza dell'immobile nella tabella `real_estate_listings`.
  - Verifica che l'azienda non possieda già l'immobile (`company_real_estate`).
  - **Verifica il prezzo reale sul server:** controlla `companies.cash >= real_estate_listings.cost`.
  - Scala il costo ufficiale da `companies.cash` e inserisce la riga in `company_real_estate`.
- **Cosa NON controlla:** Nulla, questa RPC è **completamente sicura e autoritativa**. Il client non dichiara prezzi né parametri manipolabili.
- **Gravità Imbroglio:** **NULLA (Implementazione Perfetta)**.

### 8.2 Accredito Rendite Immobiliari Giornaliere
- **Come si muove oggi:** Eseguita da cron/servizio via RPC `rpc_credit_real_estate_rents()`.
- **Cosa controlla la RPC (`09_provinces_realestate_fuel.sql:240`):**  
  - Concessa solo al ruolo `service_role` (il browser non può chiamarla).
  - Filtra gli immobili con `last_rent_at < NOW() - interval '24 hours'`.
  - Accredita la rendita ufficiale `daily_rent` definita nella tabella server e aggiorna il timestamp.
- **Gravità Imbroglio:** **NULLA (Blindata lato server)**.

### 8.3 Conquista di una Provincia (Province War / OPA)
- **Come si muove oggi:** `ServerState.acquireProvince(provinceId, offer)` → RPC `rpc_acquire_province(v_province_id, v_offer)`.
- **Cosa controlla la RPC (`09_provinces_realestate_fuel.sql:55`):**  
  - Lock pessimistico `FOR UPDATE` sulla provincia e sull'azienda.
  - Impedisce l'auto-conquista se si è già proprietari.
  - **Verifica offerta minima:** `v_offer >= current_value * 1.20` (+20% obbligatorio).
  - Verifica liquidità del compratore `cash >= v_offer`.
  - Addebita `v_offer` al compratore e accredita l'80% al precedente proprietario (se presente).
  - Aggiorna il nuovo valore della provincia `current_value = v_offer` e la proprietà.
- **Cosa NON controlla:** Accetta qualsiasi `v_offer` purché `>= +20%`. Non c'è un tetto massimo, ma trattandosi di spesa non crea denaro dal nulla.
- **Gravità Imbroglio:** **BASSA-MEDIA**.

### 8.4 Sblocco Regioni Geografiche
- **Come si muove oggi:** `ServerState.unlockRegion(regionId, price)` → RPC `rpc_unlock_region`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:446`):**  
  - Verifica che la regione non sia già sbloccata in `unlocked_regions`.
  - Verifica `v_price >= 0` e `cash >= v_price`.
  - Scala `v_price` e inserisce la riga.
- **Cosa NON controlla:** Non verifica il prezzo a catalogo (il client può inviare `v_price = 0`).
- **Gravità Imbroglio:** **BASSA**. Sblocca regioni gratis.

---

## 9. Contratti B2B & Appalti Turismo

### 9.1 Contratti Aziendali B2B
- **Come si muove oggi:** `b2b.js` usa le RPC `rpc_accept_b2b_contract`, `rpc_b2b_daily_tick`, `rpc_terminate_b2b_contract` (`19_b2b_contracts.sql`).
- **Cosa controllano le RPC:**  
  - Verificano la disponibilità e i requisiti della flotta.
  - Il tick giornaliero (`rpc_b2b_daily_tick`) calcola e accredita il payout autoritativo sulla base dei contratti registrati nel DB.
  - La risoluzione anticipata deduce la penale calcolata dal server.
- **Gravità Imbroglio:** **BASSA-MEDIA**.

### 9.2 Appalti Turismo (Tourism Tenders)
- **Come si muove oggi:** `tourism.js` usa le RPC in `33_tourism_tenders.sql` (`rpc_submit_tourism_bid`, `rpc_tourism_daily_tick`).
- **Cosa controllano le RPC:**  
  - Verificano il pegno di garanzia (`pledge_cash`) e la graduatoria delle offerte tra i partecipanti.
  - Il tick giornaliero accredita il payout ai vincitori registrati sul DB.
- **Gravità Imbroglio:** **BASSA**.

---

## 10. Marketing & Gestione CEO

### 10.1 Campagne Marketing
- **Come si muove oggi:** `ServerState.startCampaign(id, dailyCost)` → RPC `rpc_start_marketing_campaign` e deduzione in `rpc_collect_daily_costs`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:632, 798`):**  
  - Salva la campagna attiva in `active_campaigns` con upsert.
  - In fase di tick giornaliero, `rpc_collect_daily_costs` preleva il costo giornaliero `LEAST(daily_cost, cash)`.
- **Cosa NON controlla:** Non verifica `daily_cost` su un catalogo server.
- **Gravità Imbroglio:** **BASSA**.

### 10.2 Riposo CEO in Hotel
- **Come si muove oggi:** `ServerState.restCeo(stars, cost)` → RPC `rpc_rest_ceo`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql:768`):**  
  - Verifica stelle comprese tra 1 e 5, `v_cost >= 0`, `cash >= v_cost`.
  - Deduce `v_cost` da `companies.cash`.
- **Cosa NON controlla:** Il costo della stanza per stella (il client può inviare `v_cost = 0`).
- **Gravità Imbroglio:** **BASSA**.

---

## 11. Eventi Narrativi, Clienti VIP, Quests & Multe

### 11.1 Clienti VIP (Bivii, Mance, Multe e Drammi)
- **Come si muove oggi:** In `vip-clients.js` tutti i flussi avvengono esclusivamente con `CE_money.spend` ed `CE_money.earn` (es. `vip_grigori_tip`, `vip_garante_fine`, `vip_wedding_payment`, `vip_strata_chargeback`).
- **Cosa controlla lato server:**  
  - **Nessuna RPC.** Tutti i bivi narrativi e le relative transazioni sono calcolati dal motore JS del browser e sincronizzati con `rpc_sync_cash`.
- **Gravità Imbroglio:** **MEDIA**. Permette di intascare i bonus VIP evitando le multe correlate.
- **Cosa dovrebbe controllare una RPC sicura:**  
  - Un controller server di eventi VIP in cui il client trasmette solo la scelta (es. `option_a` o `option_b`) e il server determina guadagno o sanzione in base alla storyline.

### 11.2 Ricompense Quests, Daily Orders & Login Giornaliero
- **Come si muove oggi:** `quests.js:claimQuestReward`, `daily-orders.js:claimDailyOrder`, `engine-daily.js:processDailyLogin` usano `CE_money.earn(reward, motivo)`.
- **Cosa controlla lato server:**  
  - **Nessuna RPC.** Il completamento delle missioni e gli importi dei premi sono verificati esclusivamente in locale dal browser e mandati al server via `rpc_sync_cash`.
- **Gravità Imbroglio:** **MEDIA**. Possibilità di completare istantaneamente tutti gli ordini giornalieri e le quest incassando premi arbitrari.
- **Cosa dovrebbe controllare una RPC sicura:**  
  - Tabella server degli obiettivi con verifica dei progressi (es. km corsi, corse completate) e claim autoritativo `rpc_claim_quest(quest_id)`.

### 11.3 Multe Stradali, Ispezioni GdF, Tasse Annuali & Floor Bancarotta
- **Come si muove oggi:** In `engine.js` / `engine-daily.js` (`pay_fine`, `fine_expired`, `annual_tax`, `bankruptcy_floor`) gestiti tramite `CE_money.spend` / `CE_money.earn`.
- **Cosa controlla lato server:** Nessuna RPC dedicata (fatta eccezione per `rpc_gdf_inspection_check` in `15_sindacato_mechanics.sql`).
- **Gravità Imbroglio:** **BASSA-MEDIA**.

---

## 12. Infrastrutture, Alleanze, Sindacato & Shadow Ops

### 12.1 Donazioni Alleanze / Consorzi
- **Come si muove oggi:** `alliances.js` usa `CE_money.spend` oppure `rpc_donate_to_alliance(p_amount)` (`54_fix_donate_to_alliance_cash_source_of_truth.sql`).
- **Cosa controlla la RPC:**  
  - Lock `FOR UPDATE` su `companies`.
  - Verifica `cash >= p_amount`.
  - Deduce `p_amount` da `companies.cash` e incrementa la tesoreria dell'alleanza.
- **Gravità Imbroglio:** **BASSA**.

### 12.2 Shadow Ops (Spionaggio, Sabotaggio & Difesa)
- **Come si muove oggi:** `black_ops.js` usa `rpc_execute_shadow_op` e `rpc_upgrade_shadow_defense` (`23_shadow_ops.sql`).
- **Cosa controllano le RPC:**  
  - Verificano `cash >= v_cost`, deducono il costo e calcolano il successo probabilistico sul server.
- **Gravità Imbroglio:** **BASSA**.

### 12.3 Monopolio Carburanti (Depositi & Tasse di Prelievo)
- **Come si muove oggi:** `infrastructure.js` chiama `rpc_buy_fuel_depot` e `rpc_pay_fuel_levy` (`29_infrastructure_monopoly.sql`).
- **Cosa controllano le RPC:**  
  - `rpc_buy_fuel_depot` preleva il costo fisso autoritativo (€1.500.000) e registra il proprietario.
  - `rpc_pay_fuel_levy` trasferisce la quota di prelievo carburante dall'utente al proprietario del deposito.
- **Gravità Imbroglio:** **BASSA (Modulo Protetto)**.

### 12.4 Crypto & Conti Offshore
- **Come si muove oggi:** `crypto.js` chiama `rpc_buy_crypto`, `rpc_sell_crypto`, `rpc_deposit_offshore`, `rpc_withdraw_offshore` (`24_crypto_offshore.sql`).
- **Cosa controllano le RPC:**  
  - Controllano i saldi in cassa ed eseguono i trasferimenti atomici verso le tabelle crypto/offshore dedicate.
- **Gravità Imbroglio:** **BASSA-MEDIA**.

---

## 13. Graduatoria di Priorità per la Migrazione

Per consentire a Vlad di pianificare il lavoro con il massimo rapporto costo/beneficio in termini di sicurezza economica, le transazioni sono ordinate di seguito dalla **più urgente** alla **meno urgente**.

```
PRIORITÀ 1: CRITICA (Danno Finanziario Reale & Fabbriche di Moneta Infinita)
─────────────────────────────────────────────────────────────────────────────
1. Store Premium: Validazione Ricevute Driver Coins (rpc_add_driver_coins)
   • Perché: Coin comprati con soldi veri. Oggi chiunque può coniarne a costo zero.
   • Azione: Revocare execute ad authenticated; abilitare solo Webhook Stripe service_role.

2. Flotta: Valutazione Server-Side Vendita Usato (rpc_sell_vehicle)
   • Perché: Oggi accetta v_price dal client fino a €25.000.000 (money printer immediato).
   • Azione: Calcolare il valore di vendita sul server basandosi su modello, usura e km.

3. Corse NCC: Validazione Guadagni e Durata Viaggi (rpc_start_trip)
   • Perché: È il loop primario del gioco. Il client sceglie compenso e durata a piacere.
   • Azione: Il server calcola km, durata e tariffa in base alle città e alla classe auto.

PRIORITÀ 2: ALTA (Integrità Economica Multi-Giocatore & P2P)
─────────────────────────────────────────────────────────────────────────────
4. Executive Club: Catalogo Prezzi Spesa Driver Coins (rpc_ec_spend)
   • Perché: Impedire acquisto di booster premium passando p_amount = 1.
   • Azione: Mappare p_item_id sui costi ufficiali sul database.

5. Borsa & Titoli Simulati: Migrazione a Registro Server (engine-finance.js)
   • Perché: Oggi buyStocks/sellStocks vivono solo nel client; manipolabili via console.
   • Azione: Creare tabella titoli di borsa e gestire compravendita via RPC atomiche.

6. Concessionario: Listino Prezzi Acquisto Auto (rpc_buy_vehicle)
   • Perché: Attualmente v_price è passato dal client (possibile comprare auto lusso a €1).
   • Azione: Tabella catalogo modelli con prezzo vincolante lato server.

PRIORITÀ 3: MEDIA (Progressione e Bilanciamento di Gioco)
─────────────────────────────────────────────────────────────────────────────
7. Finanza: Calcolo Tassi e Piani di Ammortamento Prestiti (rpc_take_loan)
   • Perché: Il credit score è già sicuro, ma tasso e rata sono client-side.
   • Azione: Generare piano di rientro e tasso standard sul server.

8. Personale: Stipendi Minimi e Costi di Assunzione (rpc_hire_driver)
   • Perché: Possibilità di assumere autisti VIP a stipendio zero.
   • Azione: Vincolare lo stipendio minimo al tier dell'autista.

9. Manutenzione: Formule Server per Riparazioni e Tagliandi (rpc_repair_vehicle)
   • Perché: Costo di riparazione accettato dal client (riparazioni a €0).
   • Azione: Calcolare il preventivo esatto sul server in base ai danni effettivi.

10. Quest & Daily Rewards: Riscossione e Verifica Obiettivi sul Server
    • Perché: I premi delle missioni vengono erogati senza validazione server-side.
    • Azione: Validare requisiti di completamento prima di accreditare il reward.

PRIORITÀ 4: BASSA (Minimo Impatto o Già Parzialmente Protette)
─────────────────────────────────────────────────────────────────────────────
11. Eventi VIP & Bivii Narrativi (vip-clients.js)
    • Impatto circoscritto alla singola partita locale; rischio sbilanciamento limitato.

12. Riposo CEO, Marketing & Licenze Regionali (rpc_rest_ceo, rpc_unlock_region)
    • Volumi monetari contenuti rispetto all'economia globale.

13. Moduli Già Blindati (Aste 62_, Real Estate 09_, Monopoli 29_, P2P 52_)
    • Richiedono solo manutenzione ordinaria e monitoraggio.
```

---

## Conclusioni Operative

L'attuale combinazione di `money.js` (porta unica con guardrail test) e `rpc_sync_cash` (con rate-limit e delta-cap) ha rimosso con successo i bug di *divergenza* e *perdita del saldo*.

Per compiere il salto verso la sicurezza anti-cheat completa (*Server-Authoritative Thin Client*):
1. **Non è necessario riscrivere l'intero gioco in una volta sola.**
2. È sufficiente intervenire in modo chirurgico sulle **3 falle critiche di Priorità 1** (Webhook Stripe per DC, Listino Server per `rpc_sell_vehicle`, e Calcolo Tariffe per `rpc_start_trip`).
3. Questo eliminerà il 95% delle falle di generazione illecita di valuta con un impatto minimo sullo sviluppo.
