# Mappa delle Transazioni Economiche e Piano di Validazione Server-Authoritative

> **Documento per decisione strategica e architetturale**  
> **Destinatario:** Vlad / Lead Dev  
> **Data di redazione:** 21 Agosto 2026  
> **Scopo:** Censire analiticamente **ogni singola azione di gioco che muove denaro** (Euro `cash`, valuta premium `driver_coins`, token `vtk_balance`), evidenziare le vulnerabilità attuali (cosa valida il server e cosa delega ciecamente al client), stimare la gravità di ogni exploit e fornire la **roadmap prioritizzata per la migrazione server-authoritative definitiva**.
>
> ⚠️ **Nota:** Questo documento NON introduce modifiche al codice o alle RPC attive. È la guida numerica e architetturale per decidere tempi e modalità del refactoring.

---

## 1. Sintesi Esecutiva & Stato di Copertura

### 1.1 Il Modello Attuale: Sincronizzazione vs Validazione
Oggi il saldo di cassa (`gameState.cash`) si muove secondo un modello a **sorgente client con mirror server**:
1. Il client JavaScript simula o riceve l'input dell'utente;
2. Esegue la transazione tramite `CE_money.spend()` / `CE_money.earn()` (porta unica creata per risolvere le divergenze e gli acquisti gratis al reload);
3. `CE_money` invia il totale assoluto risultante al server chiamando `ServerState.syncCash(cash)` -> `rpc_sync_cash(v_cash)`.
4. Per alcune azioni esiste una RPC Supabase dedicata (es. acquisto auto, assunzione autisti, riparazioni, aste, P2P), ma molte di esse accettano importi arbitrari inviati come argomenti o non verificano listini autoritativi server-side.

**Cosa risolve questo modello:**
- ✅ **Divergenza:** Nessun acquisto gratis al ricaricamento della pagina, nessun denaro che svanisce per mancato allineamento tra memoria e database.

**Cosa NON risolve (il rischio imbroglio):**
- ❌ **Client-Authoritative Minting:** Chi apre la console degli strumenti di sviluppo (DevTools) o altera lo script può inviare parametri arbitrari a `rpc_sync_cash` o chiamare RPC senza validazione del prezzo, convalidando qualsiasi saldo desiderato.

---

### 1.2 Mappa di Copertura del Censimento
Tutte le macro-aree e le transazioni del gioco sono state censite e analizzate:
- ✅ **Sezione 2:** Valuta Premium & Negozio Executive Club (`driver_coins`) — *8 azioni censite*
- ✅ **Sezione 3:** Garage & Gestione Flotta (`cash` / `driver_coins`) — *15 azioni censite*
- ✅ **Sezione 4:** Risorse Umane & Autisti (`cash` / `driver_coins`) — *9 azioni censite*
- ✅ **Sezione 5:** Corse, Dispatch & Servizi VIP (`cash` / `driver_coins` / `reputation`) — *6 azioni censite*
- ✅ **Sezione 6:** Finanza, Investimenti, Borsa & Immobili (`cash`) — *11 azioni censite*
- ✅ **Sezione 7:** Contratti Corporate, B2B, Turismo & Aste (`cash` / `reputation`) — *5 azioni censite*
- ✅ **Sezione 8:** Multiplayer P2P, Holding, Consorzi & Territori (`cash` / `driver_coins`) — *8 azioni censite*
- ✅ **Sezione 9:** Token VTK, Criptovalute & Operazioni Ombra (`cash` / `driver_coins` / `vtk`) — *6 azioni censite*
- ✅ **Sezione 10:** Quartier Generale (HQ) (`cash`) — *1 macro-azione permanente censita*
- ✅ **Sezione 11:** Matrice di Priorità e Piano di Migrazione Ordinato

---

## 2. Valuta Premium & Negozio Executive Club (Driver Coins)

### 2.1 Conio / Acquisto Driver Coins con Denaro Reale
- **Come si muove oggi:**  
  `CE_money.earnDC(qty, 'acquisto')` -> chiama `ServerState.addDriverCoins(qty)` -> RPC `rpc_add_driver_coins(p_amount, p_item_id)`.
- **Cosa controlla lato server:**  
  (Vedi `05_mmo_driver_coins.sql`, `17_executive_club.sql`, `41_cap_driver_coins.sql`, `43_ratelimit_driver_coins.sql`):
  - Verifica autenticazione `auth.uid()`;
  - Verifica esistenza record in `companies`;
  - Applicato tetto massimo di accredito per singola chiamata (`p_amount <= 1.000.000`);
  - Rate limit applicato tramite `_ce_rate_limit`;
  - Scrive il log in `coin_transactions`.
- **Cosa NON controlla:**  
  **Zero validazione del pagamento reale.** Non esiste verifica webhook Stripe / store provider (Google/Apple). Qualsiasi utente autenticato può chiamare `rpc_add_driver_coins(50000)` da console Supabase e ottenere valuta premium gratis.
- **Cosa dovrebbe controllare una RPC sicura:**  
  La funzione `rpc_add_driver_coins` DEVE essere rimossa dal ruolo `authenticated` e riservata esclusivamente a `service_role`. L'accredito deve avvenire unicamente via Webhook backend firmato da Stripe/gateway di pagamento a fronte di un checkout andato a buon fine.
- **Gravità:** 🔴 **CRITICA / MASSIMA**. È la valuta monetizzabile con denaro reale. Un cheat qui distrugge il modello di business e azzera il fatturato del gioco.

---

### 2.2 Spesa Driver Coins nell'Executive Club
- **Come si muove oggi:**  
  `CE_money.spendDC(cost, motivo)` -> chiama `ServerState.spendDriverCoins(itemId, amount)` -> RPC `rpc_ec_spend(p_item_id, p_amount)`.
- **Cosa controlla lato server:**  
  (Vedi `17_executive_club.sql`, `51_lockdown_driver_coins_negative_cost_scaffold.sql`):
  - Autenticazione `auth.uid()`;
  - Blocca importi `<= 0` (`p_amount <= 0` solleva eccezione, impedendo minting con costi negativi);
  - Verifica con `FOR UPDATE` che `companies.driver_coins >= p_amount`;
  - Deduce il saldo e scrive su `coin_transactions` con tipo `spend`.
- **Cosa NON controlla:**  
  Non verifica il prezzo ufficiale dell'articolo (`item_id`) a listino: il client dichiara sia l'identificativo dell'item che la quantità di coin da pagare. Se un articolo a catalogo costa 500 DC, il client può inviare `p_amount: 1` e ottenere l'effetto.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Tabella listino server-side (`ec_catalog (item_id, price_dc, handler_action)`). La RPC accetta solo `item_id`, legge il prezzo dalla tabella e deduce il costo esatto.
- **Gravità:** 🔴 **ALTA**. Consente acquisti premium sottocosto erodendo il valore dei DC acquistati.

---

### 2.3 Acquisto Booster e Servizi Istantanei con DC (Store / Fleet / HR)
*(Upgrade limite offline, Auto-Rest CEO, Ricarica Energia, Riparazione Istantanea Flotta, Contatto VIP, HR Automation)*
- **Come si muove oggi:**  
  `CE_money.spendDC()` e/o RPC dedicate in `serverState.js` (`upgradeOfflineLimit`, `buyAutoRest`, `buyEnergyRefill`, `buyFleetRepair`, `buyVipContact`, `buyHRAutomation`).
- **Cosa controlla lato server:**  
  (Vedi `04_mmo_idle_mechanics.sql`, `12_hr_automation.sql`, `51_*`):
  - Verifica autenticazione e blocco `p_cost_in_coins <= 0`;
  - Verifica saldo `driver_coins >= cost`;
  - Aggiorna lo stato su `companies` (`offline_gains_limit_hours`, `hr_automation_expires_at`, ecc.).
- **Cosa NON controlla:**  
  Il prezzo `cost` è passato dal client come parametro (es. `v_cost_in_coins`), non confrontato con una costante o tabella server.
- **Cosa dovrebbe controllare una RPC sicura:**  
  La RPC deve impostare il costo internamente (es. HR Automation per 7 giorni costa 150 DC fissi definiti in SQL).
- **Gravità:** 🟡 **MEDIA-ALTA**. Vantaggi competitivi e bypass dei tempi di gioco a costo arbitrario.

---

## 3. Garage & Gestione Flotta

### 3.1 Acquisto Veicolo da Showroom Concessionario
- **Come si muove oggi:**  
  `showroom.js` chiama `ServerState.buyVehicle(modelId, price, hqCity)` -> RPC `rpc_buy_vehicle`.
- **Cosa controlla lato server:**  
  (Vedi `01_mmo_migration.sql:184-230`):
  - Verifica autenticazione `auth.uid()`;
  - Lock `companies FOR UPDATE`;
  - Verifica `v_price >= 0`;
  - Verifica `companies.cash >= v_price`;
  - Deduce `v_price` da `companies.cash`;
  - Inserisce riga in `vehicles` con stato `IDLE`, targa generata lato server e città HQ.
- **Cosa NON controlla:**  
  **Il listino prezzi del modello.** `v_model_id` e `v_price` sono parametri client. Non c'è una tabella `vehicle_models` in SQL: il server accetta che una vettura top di gamma (es. valore €1.200.000) venga acquistata inviando `v_price: 1`. Non controlla nemmeno la capienza massima del garage/HQ.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Tabella catalogo modelli veicoli (`vehicle_catalog`) con prezzo base autoritativo. La RPC deve ricevere solo `v_model_id`, prelevare il prezzo dal catalogo, verificare i requisiti di reputazione/prestigio e spazio garage disponibile, ed eseguire la deduzione esatta.
- **Gravità:** 🟠 **ALTA**. Permette di creare flotte sterminate di veicoli lusso con €1, falsando l'intera economia del giocatore e le classifiche.

---

### 3.2 Vendita Veicolo Usato
- **Come si muove oggi:**  
  `engine-fleet.js` / `ui-fleet.js` chiama `ServerState.sellVehicle(vehicleId, price)` -> RPC `rpc_sell_vehicle`.
- **Cosa controlla lato server:**  
  (Vedi `09_provinces_realestate_fuel.sql:394`, `49_lockdown_critical_cash_rpcs_scaffold.sql:91`):
  - Verifica autenticazione e proprietà del veicolo (`company_id = v_company.id`);
  - Verifica stato veicolo (`status = 'IDLE'`);
  - Tetto di sicurezza sul prezzo (`v_price BETWEEN 0 AND 25000000`);
  - Cancella il veicolo da `vehicles` e accredita `v_price` su `companies.cash`.
- **Cosa NON controlla:**  
  Non calcola il valore residuo reale dell'auto in base a chilometraggio (`mileage`), condizioni (`condition`), usura e modello. Qualsiasi utilitaria distrutta può essere venduta al cap massimo di €25.000.000.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Calcolo server-side del valore di rottamazione/permuta: `valore_base * (condition / 100) * fattore_svalutazione_km + valore_upgrade`. Il client non deve poter inviare `v_price`.
- **Gravità:** 🔴 **CRITICA / ALTA**. È un generatore istantaneo di cassa: basta comprare un'auto economica e rivenderla a 25 milioni di euro.

---

### 3.3 Riparazione Ordinaria Veicolo
- **Come si muove oggi:**  
  `engine-fleet.js` / `serverState.js` chiama `ServerState.repairVehicle(vehicleId, cost)` -> RPC `rpc_repair_vehicle`.
- **Cosa controlla lato server:**  
  (Vedi `02_mmo_rpcs_extension.sql:732`):
  - Autenticazione `auth.uid()`;
  - Lock `companies FOR UPDATE`;
  - Verifica `v_cost >= 0`;
  - Verifica proprietà veicolo (`company_id = v_company.id`);
  - Verifica stato veicolo (`status IN ('IDLE', 'MAINTENANCE')`);
  - Verifica fondi sufficienti (`companies.cash >= v_cost`);
  - Deduce `v_cost` da `companies.cash`;
  - Ripristina `condition = 100`, `tire_pressure = 100`, `status = 'IDLE'`.
- **Cosa NON controlla:**  
  Non calcola la spesa di riparazione in base ai punti danno effettivi (`100 - condition`). Il client può passare `v_cost: 0` e riparare gratuitamente qualsiasi veicolo a zero euro.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Calcolo del costo in SQL: `v_danno := (100 - condition) + (100 - tire_pressure); v_costo_reale := v_danno * tariffa_unitaria;`.
- **Gravità:** 🟡 **MEDIA**. Riparazioni gratuite eliminano i costi di gestione della flotta.

---

### 3.4 Rifornimento Carburante & Gomme Veicolo
- **Come si muove oggi:**  
  `ServerState.refuelVehicle(vehicleId, fuelAmount, cost)` -> RPC `rpc_refuel_vehicle`.
- **Cosa controlla lato server:**  
  (Vedi `02_mmo_rpcs_extension.sql:669`, `58_*`):
  - Verifica proprietà, `v_fuel_amount > 0`, `v_cost >= 0`, fondi sufficienti.
  - Incrementa `fuel_level` (max 100) e deduce `v_cost`.
- **Cosa NON controlla:**  
  Non confronta il costo con il prezzo ufficiale del carburante (`fuel_market.price_eur`). Permette rifornimenti a costo zero (`v_cost = 0`).
- **Cosa dovrebbe controllare una RPC sicura:**  
  Lettura del prezzo al litro corrente da `fuel_market`, calcolo litri necessari e addebito automatico.
- **Gravità:** 🟢/🟡 **MEDIO-BASSA**. Riduzione costi operativi di corsa.

---

### 3.5 Upgrade Veicolo & Telepass
- **Come si muove oggi:**  
  `ServerState.buyVehicleUpgrade` -> `rpc_buy_vehicle_upgrade`; `ServerState.toggleTelepass` -> `rpc_toggle_telepass`.
- **Cosa controlla lato server:**  
  (Vedi `02_mmo_rpcs_extension.sql:274, 340`):
  - Autenticazione, proprietà, stato `IDLE`, fondi sufficienti;
  - Evita duplicati (l'upgrade non deve essere già presente nell'array `upgrades`).
- **Cosa NON controlla:**  
  Prezzo dell'upgrade dichiarato dal client (`v_price`). Telepass attivabile dichiarando `v_cost: 0`.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Listino server degli upgrade (es. blindatura, vetri oscurati, frigobar, telepass) e costi fissi autoritativi.
- **Gravità:** 🟡 **MEDIA**. Upgrade gratuiti su tutta la flotta.

---

### 3.6 Deposito Carburante & Pneumatici Privato (Infrastruttura Garage)
- **Come si muove oggi:**  
  `buyFuelForDepot`, `upgradeFuelDepot`, `buyTiresForDepot`, `buyMaintenanceContract` in `engine-fleet.js`.
- **Come viaggia il denaro:**  
  `CE_money.spend(cost)` -> aggiorna solo `gameState.cash` e risincronizza con `rpc_sync_cash`. **Nessuna RPC dedicata**.
- **Cosa controlla lato server:**  
  Nessun controllo tranne il rate-limit e il delta cap di `rpc_sync_cash`.
- **Cosa dovrebbe controllare una RPC sicura:**  
  RPC `rpc_manage_garage_depot(action, quantity)` che valida capienza del serbatoio aziendale, prezzo all'ingrosso e livello dell'infrastruttura.
- **Gravità:** 🟡 **MEDIA**. Risparmio costi logistici aziendali.

---

### 3.7 Acquisto e Vendita Hub Territoriali
- **Come si muove oggi:**  
  `buyHub`, `sellHub`, `returnToHub` in `engine-fleet.js` usano `CE_money.spend` / `CE_money.earn` e salvataggio locale.
- **Cosa controlla lato server:**  
  Nessun controllo specifico.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Tracciamento degli Hub su tabella DB (`company_hubs`), costo di acquisto e rimborso di vendita calcolati dal server.
- **Gravità:** 🟡 **MEDIA**.

---

## 4. Risorse Umane & Autisti

### 4.1 Assunzione Autista
- **Come si muove oggi:**  
  - Nel pannello Staff Ufficio: chiama `ServerState.hireDriver(name, salary, tier)` -> RPC `rpc_hire_driver`.
  - Nel mercato reclutamento driver in `engine-drivers.js`: usa `CE_money.spend(cost, 'hire_driver')` e gestione locale.
- **Cosa controlla lato server (nella RPC):**  
  (Vedi `02_mmo_rpcs_extension.sql:102`):
  - Verifica `tier IN ('STANDARD', 'BUSINESS', 'VIP', 'ULTRA')`;
  - Verifica `v_salary >= 0`;
  - Calcola costo assunzione: `v_hiring_cost := v_salary * 2`;
  - Verifica `companies.cash >= v_hiring_cost`, deduce il costo e inserisce l'autista in `drivers`.
- **Cosa NON controlla:**  
  Non valida lo stipendio minimo associato al tier: il client può richiedere un autista di livello `ULTRA` passando `v_salary: 0`, ottenendo l'assunzione a €0 e stipendio zero per sempre. Inoltre il flusso di `engine-drivers.js` scavalca del tutto la RPC.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Tabella server delle classi autisti con range salariali vincolanti (`salary_min`, `salary_max` per tier), unificazione di tutti i call-site su una sola RPC.
- **Gravità:** 🟠 **ALTA**. Autisti con statistiche perfette e costo zero a vita.

---

### 4.2 Licenziamento Autista
- **Come si muove oggi:**  
  `ServerState.fireDriver(driverId)` -> RPC `rpc_fire_driver` (nessuna transazione economica, ma sblocca lo slot).
- **Cosa controlla lato server:**  
  Verifica proprietà, esistenza e che lo stato sia `AVAILABLE` (non in corsa).
- **Cosa NON controlla:**  
  La cancellazione locale in `engine-drivers.js` non controlla se l'autista è in corsa (`busy`).
- **Gravità:** 🟡 **MEDIA**. Potenziale corruzione di chiavi esterne su corse attive.

---

### 4.3 Bonus, Recupero Stress, Risoluzione Scioperi, Academy
- **Come si muove oggi:**  
  `engine-drivers.js` (`payBonus`, `payStressClear`, `resolveStrike`, `startAcademyCourse`, `skipAcademy`).
- **Come viaggia il denaro:**  
  `CE_money.spend()` per cash, `CE_money.spendDC()` per skip con valuta premium. **Nessuna RPC dedicata lato server**.
- **Cosa controlla lato server:**  
  Zero controlli sulle statistiche dell'autista.
- **Cosa dovrebbe controllare una RPC sicura:**  
  RPC `rpc_driver_action(driver_id, action_type)` che aggiorna livello di stress, XP e status di sciopero dell'autista lato server.
- **Gravità:** 🟡 **MEDIA**. Maxing istantaneo delle abilità degli autisti.

---

## 5. Corse, Dispatch & Servizi VIP

### 5.1 Inizio Corsa (Start Trip) & Rientro a Vuoto (Empty Return)
- **Come si muove oggi:**  
  `ServerState.startTrip(vehicleId, driverId, endCity, rewardCash, durationMs, isEmptyReturn)` -> RPC `rpc_start_trip`.
- **Cosa controlla lato server:**  
  (Vedi `01_mmo_migration.sql:234-315`):
  - Verifica proprietà veicolo e autista;
  - Verifica stato veicolo (`IDLE`) e autista (`AVAILABLE`);
  - Verifica co-localizzazione (veicolo e autista devono trovarsi nella stessa città);
  - Applica sconto durata -15% se il veicolo ha il Telepass;
  - Se `is_empty_return`: deduce il costo di trasferimento e imposta ricompensa a 0;
  - Imposta veicolo su `ON_TRIP`, autista su `DRIVING` e inserisce riga in `active_trips` con scadenza temporale `end_time = now() + duration`.
- **Cosa NON controlla:**  
  **L'importo della ricompensa (`v_reward`) e la durata (`v_duration_ms`).** Entrambi sono forniti dal client: un client alterato può avviare un viaggio di durata 1 secondo con ricompensa di €50.000.000.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Distanziere e calcolo tariffario server-side: date `start_city`, `end_city`, tier richiesto e condizioni traffico, il server calcola `reward` e `duration` attesa.
- **Gravità:** 🔴 **CRITICA / ALTA**. È il core loop del gioco: dichiarare reward arbitrari equivale a generare denaro infinito a comando.

---

### 5.2 Riscatto Ricompensa Corsa (Claim Trip Reward)
- **Come si muove oggi:**  
  `ServerState.claimReward(tripId)` -> RPC `rpc_claim_trip_reward`.
- **Cosa controlla lato server:**  
  (Vedi `01_mmo_migration.sql:318-375`, `49_*`):
  - Verifica proprietà del viaggio in `active_trips`;
  - **Gate temporale server-side:** `IF now() < trip.end_time THEN RAISE EXCEPTION 'viaggio non completato'`;
  - Accredita il `reward_cash` memorizzato nel viaggio, incrementa reputazione (`+0.01`), aggiorna posizione e chilometraggio veicolo, incrementa stanchezza autista ed elimina il record da `active_trips`.
- **Cosa NON controlla:**  
  Se la corsa è stata avviata con una ricompensa truccata in `rpc_start_trip`, la riscossione trasferisce fedelmente la cifra truccata nel saldo aziendale.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Essendo il gate temporale già protetto da `now() < end_time`, la sicurezza dipende interamente dalla robustezza dei dati salvati in `start_trip`.
- **Gravità:** 🔴 **ALTA** (a cascata su 5.1).

---

### 5.3 Mance, Drop DC Ultra, Multe Corsa, Bivi & Ordini Giornalieri
- **Come si muove oggi:**  
  - Mance Charmante / Bivi Quests: `CE_money.earn()` / `CE_money.spend()`;
  - Drop DC Ultra: `CE_money.earnDC(drop, 'ultra_ride_drop')`;
  - Multe autovelox/ZTL: `CE_money.spend(fine)` / `CE_money.earn(-fine)`;
  - Ordini giornalieri (`daily-orders.js`): `CE_money.earnDC()` / `rpc_add_driver_coins`.
- **Cosa controlla lato server:**  
  Nessuna validazione specifica se non i rate limit generici su DC e syncCash.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Generazione casuale degli eventi di corsa lato server durante il completamento o la risoluzione della corsa.
- **Gravità:** 🟡 **MEDIA**.

---

## 6. Finanza, Investimenti, Borsa & Immobili

### 6.1 Accensione Prestito Bancario (Take Loan)
- **Come si muove oggi:**  
  `engine-finance.js` gestisce i prestiti in locale; `ServerState.takeLoan(principal, interestRate, dailyPayment)` -> RPC `rpc_take_loan`.
- **Cosa controlla lato server:**  
  (Vedi `02_mmo_rpcs_extension.sql:475`, `49_lockdown_critical_cash_rpcs_scaffold.sql:151`):
  - Verifica massimo 3 prestiti simultanei;
  - Calcola punteggio creditizio server-side conservativo basato su `reputation`, `cash` e debiti pregressi;
  - Determina fido massimo scaglionato (da €100.000 a €5.000.000);
  - Blocca richieste che superano il fido disponibile;
  - Incrementa `companies.cash` e inserisce il debito in `company_loans`.
- **Cosa NON controlla:**  
  La rata giornaliera `v_daily_payment` e il tasso `v_interest_rate` sono passati dal client: un giocatore potrebbe richiedere €5.000.000 con rata di €1 al giorno e tasso 0%.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Piani di ammortamento standardizzati calcolati dal server in base alla durata del prestito.
- **Gravità:** 🟠 **ALTA**. Liquidità immediata senza oneri di restituzione sostenibili.

---

### 6.2 Rimborso Prestito Bancario (Repay Loan)
- **Come si muove oggi:**  
  `ServerState.repayLoan(loanId, amount)` -> RPC `rpc_repay_loan`.
- **Cosa controlla lato server:**  
  (Vedi `02_mmo_rpcs_extension.sql:535`):
  - Proprietà del prestito, verifica `v_amount > 0`, verifica fondi sufficienti (`cash >= repaid`);
  - Scala il debito residuo e cancella il record se estinto.
- **Cosa NON controlla:**  
  La procedura è sicura e ben implementata.
- **Gravità:** 🟢 **BASSA** (già ben controllata).

---

### 6.3 Mercato Azionario (Borsa, Short Selling, Broker, Venture Capital)
- **Come si muove oggi:**  
  `engine-finance.js` (`buyStocks`, `sellStocks`, `shortSell`, `placeBrokerInvestment`, `acquireVentureStake`).
- **Come viaggia il denaro:**  
  `CE_money.spend()` all'acquisto, `CE_money.earn()` alla vendita e nei dividendi giornalieri (`engine-daily.js`). **Zero RPC, sistema 100% client-side**.
- **Cosa controlla lato server:**  
  Nessun controllo. Nessun record sul database dello stock posseduto o della posizione corta aperta.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Tabella quotazioni di borsa (`market_stocks`), tracciamento del portafoglio ordini su DB e calcolo dividendi autoritativo.
- **Gravità:** 🟠 **ALTA**. Creazione di profitti finanziari speculativi istantanei e illimitati.

---

### 6.4 Acquisto Immobili (Real Estate) & Rendita Giornaliera
- **Come si muove oggi:**  
  `ui-realestate.js` chiama `ServerState.buyRealEstate(listingId)` -> RPC `rpc_buy_real_estate`.
- **Cosa controlla lato server:**  
  (Vedi `09_provinces_realestate_fuel.sql:222`):
  - Lock tabella immobili e azienda;
  - Verifica che l'immobile esista nel catalogo `real_estate_listings`;
  - Verifica che l'immobile non sia già stato acquistato (`UNIQUE (company_id, listing_id)`);
  - Legge il prezzo **direttamente dalla colonna `real_estate_listings.cost`** (non dal client!);
  - Verifica `companies.cash >= cost`, deduce il prezzo e inserisce in `company_real_estate`.
- **Cosa NON controlla:**  
  L'accredito delle rendite giornaliere (`rpc_credit_real_estate_rents`) è eseguibile solo da `service_role` (cron).
- **Valutazione:** 🟢 **ESEMPIO VIRTUOSO**. Questa RPC è pienamente server-authoritative e protetta da cheat di prezzo.

---

### 6.5 Sblocco Nuove Regioni
- **Come si muove oggi:**  
  `ServerState.unlockRegion(regionId, price)` -> RPC `rpc_unlock_region`.
- **Cosa controlla lato server:**  
  (Vedi `02_mmo_rpcs_extension.sql:595`):
  - Verifica che la regione non sia già sbloccata in `unlocked_regions`;
  - Verifica fondi sufficienti e deduce `v_price`.
- **Cosa NON controlla:**  
  Il prezzo `v_price` è passato dal client (sbloccabile a €0).
- **Cosa dovrebbe controllare una RPC sicura:**  
  Tabella fissa regioni con costi di concessione autoritativi.
- **Gravità:** 🟡 **MEDIA**. Espansione geografica a costo zero.

---

### 6.6 Marketing, Riposo CEO, Donazioni Lobby & Tick Costi Giornalieri
- **Come si muove oggi:**  
  - Marketing: `rpc_start_marketing_campaign` (costo passato da client);
  - Hotel CEO: `rpc_rest_ceo` (costo passato da client);
  - Lobby: `donateToLobby` in `engine-finance.js` (solo `CE_money.spend`);
  - Tick giornaliero: `rpc_collect_daily_costs` e calcoli netti in `engine-daily.js`.
- **Gravità:** 🟡 **MEDIA-BASSA**.

---

## 7. Contratti Corporate, B2B, Turismo & Aste

### 7.1 Contratti Corporate
- **Come si muove oggi:**  
  `contracts.js` (`acceptDiamondContract`, completamento corse contratto). Gestione interamente locale via `CE_money.earn/spend`.
- **Gravità:** 🟡 **MEDIA**.

---

### 7.2 Contratti B2B
- **Come si muove oggi:**  
  `b2b.js` chiama `rpc_accept_b2b_contract`, `rpc_terminate_b2b_contract`, `rpc_b2b_daily_tick`.
- **Cosa controlla lato server:**  
  (Vedi `19_b2b_contracts.sql`):
  - Valida la durata e la presenza di penali;
  - In `rpc_accept_b2b_contract` controlla solo il conteggio dei veicoli assegnati.
- **Cosa NON controlla:**  
  Non verifica che i veicoli assegnati appartengano davvero al giocatore o soddisfino i requisiti di classe/tier.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Controllo su `vehicles` per verificare proprietà, tier e stato non occupato.
- **Gravità:** 🟠 **ALTA**. Monopolio contratti con flotta fantasma.

---

### 7.3 Gare d'Appalto Turismo
- **Come si muove oggi:**  
  `tourism.js` chiama `rpc_submit_tourism_bid`, `rpc_cancel_tourism_bid`, `rpc_tourism_daily_tick`.
- **Cosa controlla lato server:**  
  (Vedi `33_tourism_tenders.sql`):
  - Registra l'offerta del bando e la commissione offerta.
- **Cosa NON controlla:**  
  Il parametro `v_qualifying_vehicles` è auto-dichiarato dal client senza verificare il parco auto reale (rappresenta il 40% del punteggio di gara). Inoltre il deposito cauzionale non viene bloccato in escrow.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Verifica server-side dei requisiti della flotta e blocco dell'anticipo in escrow.
- **Gravità:** 🟠 **ALTA**. Vincita truccata di appalti turistici competitivi.

---

### 7.4 Aste Giudiziarie Veicoli
- **Come si muove oggi:**  
  `auctions.js` chiama `rpc_place_auction_bid` e `rpc_claim_auction` (Vedi `62_aste_ciclo_di_vita.sql`).
- **Cosa controlla lato server:**  
  - Verifica che l'offerta superi la precedente;
  - Registra l'offerente più alto;
  - Al termine (`rpc_resolve_auction`), addebita il vincitore e assegna il veicolo o i contanti residui.
- **Cosa NON controlla:**  
  Il denaro non viene prelevato al momento del bid (escrow), ma solo a fine asta con `LEAST(cash, win_bid)`. Un giocatore può rilanciare milioni, svuotare la cassa altrove e ottenere l'auto all'asta quasi gratis.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Blocco dei fondi dell'offerta al momento del rilancio (`escrow_cash`) e rimborso automatico in caso di sorpasso da altro offerente.
- **Gravità:** 🟠 **ALTA**. Furto di veicoli rari alle aste pubbliche a danno di altri giocatori.

---

### 7.5 OPA Ostile (Hostile Takeovers)
- **Come si muove oggi:**  
  `hostile_takeover.js` chiama `rpc_opa_buyback` (Vedi `27_hostile_takeovers.sql`).
- **Cosa controlla lato server:**  
  - Verifica autenticazione, fondi, ricalcolo quota di maggioranza e addebito sul saldo aziendale.
- **Valutazione:** 🟢 **BUONO / SOLIDO**. Già ben strutturato lato server.

---

## 8. Multiplayer P2P, Holding, Consorzi & Territori

### 8.1 Mercato Compravendita Veicoli P2P
- **Come si muove oggi:**  
  `p2p-market.js` chiama `rpc_list_car_for_sale`, `rpc_buy_market_car`, `rpc_cancel_listing`.
- **Cosa controlla lato server:**  
  (Vedi `08_mmo_p2p_marketplace.sql`, `52_fix_p2p_sindacato_cash_source_of_truth.sql`):
  - Verifica che il compratore non sia il venditore;
  - Verifica stato del listing (`ACTIVE`);
  - Verifica fondi compratore (`cash >= price`);
  - Esegue transazione atomica: addebito compratore, accredito venditore, trasferimento proprietà riga in `vehicles`.
- **Cosa NON controlla:**  
  Prezzo di vendita libero senza floor/cap di mercato, permettendo riciclaggio di denaro e trasferimento di cassa tra account secondari e principali.
- **Cosa dovrebbe controllare una RPC sicura:**  
  Range di prezzo vincolato al valore di perizia del mezzo (`fair_market_value ± 30%`).
- **Gravità:** 🔴 **ALTA**. Rischio primario di money-laundering tra multi-account.

---

### 8.2 Holding Aziendali, IPO & Azioni Societarie
- **Come si muove oggi:**  
  `p2p-market.js` chiama `rpc_create_holding`, `rpc_contribute_holding_treasury`, `rpc_list_company_ipo`, `rpc_buy_company_shares`, `rpc_sell_company_shares`.
- **Cosa controlla lato server:**  
  (Vedi `08_mmo_p2p_marketplace.sql`, `52_*`, `57_*`):
  - Addebiti e accrediti gestiti su `companies.cash` via `_add_player_cash`;
  - Verifica proprietà delle quote azionarie;
  - Tassa IPO di €50.000 addebitata lato server.
- **Cosa NON controlla:**  
  Valutazione dell'IPO auto-dichiarata senza revisione degli attivi patrimoniali reali.
- **Gravità:** 🟠 **ALTA**. Manipolazione della finanza cooperativa multi-player.

---

### 8.3 Sindacato, Consorzi & Mazzette
- **Come si muove oggi:**  
  `p2p-render.js` / `p2p-market.js` chiama `rpc_contribute_consorzio`, `rpc_pay_don_carmine`, `rpc_gdf_inspection_check`.
- **Cosa controlla lato server:**  
  (Vedi `15_sindacato_mechanics.sql`, `52_*`):
  - Transazioni cassa centralizzate su DB con controlli di saldo e addebito multe.
- **Gravità:** 🟡 **MEDIA**.

---

### 8.4 Guerra delle Province (Conquista Territorio & Tasse di Transito)
- **Come si muove oggi:**  
  `war_room.js` / `ServerState.acquireProvince` -> RPC `rpc_acquire_province`.
- **Cosa controlla lato server:**  
  (Vedi `09_provinces_realestate_fuel.sql:53-128`):
  - Lock `provinces FOR UPDATE`;
  - Impedisce conquista della propria provincia;
  - **Offerta minima obbligatoria al 120% del valore attuale** (`v_min_offer := CEIL(current_value * 1.20)`);
  - Verifica fondi compratore (`cash >= offer`);
  - Addebita compratore, **accredita l'80% al precedente proprietario** su `companies.cash`, aggiorna la proprietà e genera la notizia globale.
- **Valutazione:** 🟢 **ESEMPIO VIRTUOSO**. Transazione atomica multiplayer robusta e a prova di imbroglio.

---

## 9. Token VTK, Criptovalute & Operazioni Ombra

### 9.1 Mercato Token VTK & VTK Shop
- **Come si muove oggi:**  
  `vtk-market.js` chiama `rpc_fill_vtk_order`, `rpc_spend_vtk_shop_item`.
- **Cosa controlla lato server:**  
  (Vedi `21_vtk_token.sql`, `46_vtk_shop_purchase_scaffold.sql`):
  - Scambio atomico tra `driver_coins` e `vtk_balance`;
  - Validazione saldo VTK per acquisto oggetti speciali nello shop.
- **Gravità:** 🟠 **ALTA**. Collegato direttamente alla valuta premium DC.

---

### 9.2 Trading Criptovalute & Conto Offshore
- **Come si muove oggi:**  
  `crypto.js` chiama `rpc_buy_crypto`, `rpc_sell_crypto`, `rpc_deposit_offshore`, `rpc_withdraw_offshore`.
- **Cosa controlla lato server:**  
  (Vedi `24_crypto_offshore.sql`):
  - Traccia bilanci crypto e offshore su tabella DB protetta da RLS.
- **Gravità:** 🟡 **MEDIA**.

---

### 9.3 Shadow Ops & Nemesis
- **Come si muove oggi:**  
  `black_ops.js` (`rpc_execute_shadow_op`, `rpc_upgrade_shadow_defense`); `nemesis.js` (`rpc_nemesis_bribe_vip`).
- **Cosa controlla lato server:**  
  (Vedi `23_shadow_ops.sql`, `28_nemesis_vip.sql`, `53_*`):
  - Deduzioni di cassa per attacchi e potenziamento difese gestite direttamente nelle RPC.
- **Gravità:** 🟡 **MEDIA**.

---

## 10. Quartier Generale (HQ)

### 10.1 Costruzione e Potenziamento Stanze HQ
- **Come si muove oggi:**  
  `hq.js` (`hqUpgradeRoom`). Il client verifica `gameState.cash`, sottrae il costo con `CE_money.spend(cost, 'hq_upgrade')` e salva lo stato nel blob del save locale. **Nessuna RPC dedicata**.
- **Cosa controlla lato server:**  
  Nessun controllo.
- **Cosa NON controlla:**  
  Gli upgrade dell'HQ conferiscono **moltiplicatori economici permanenti e globali** (es. `allEarningsMult`, `tipMult`, `salaryCostMult`, `driverXpMult`, sconti riparazioni, ecc.).
- **Cosa dovrebbe controllare una RPC sicura:**  
  Tabella `company_hq_rooms (company_id, room_id, level)`. RPC `rpc_upgrade_hq_room(room_id)` che legge il costo del livello successivo, valida i requisiti di prestigio, deduce il denaro e incrementa il livello su DB.
- **Gravità:** 🔴 **ALTA / CRITICA**. Un cheat sull'HQ non regala solo denaro una-tantum, ma installa moltiplicatori permanenti che alterano ogni futura azione economica dell'account.

---

## 11. Lista Ordinata di Migrazione: Da Dove Conviene Partire e Perché

Per massimizzare la sicurezza economica con il minimo dispendio di tempo e senza bloccare il gameplay, l'ordine di migrazione consigliato per Vlad è suddiviso in 5 Fasi di Rilascio:

```
+-----------------------------------------------------------------------------------+
| FASE 1: SICUREZZA VALUTA REALE & EXPLOIT CRITICI DI MINTING                       |
| (Obiettivo: Proteggere il fatturato reale e chiudere i generatori di cassa infinita) |
+-----------------------------------------------------------------------------------+
| 1. rpc_add_driver_coins -> Revoca permessi ad authenticated, solo Webhook Stripe  |
| 2. rpc_sell_vehicle     -> Calcolo prezzo server-side (vietare v_price client)     |
| 3. rpc_start_trip       -> Calcolo durata e reward autoritativo su DB             |
| 4. rpc_sync_cash        -> Riduzione progressiva verso ledger delta autoritativo   |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 2: MERCATI MULTIPLAYER, ASTE & FINANZA CONDIVISA                            |
| (Obiettivo: Proteggere l'integrità competitiva e il gioco tra utenti reali)       |
+-----------------------------------------------------------------------------------+
| 5. Aste Giudiziarie     -> Escrow obbligatorio sui rilanci in rpc_place_auction_bid|
| 6. Mercato P2P Veicoli  -> Price-band vincolante per prevenire riciclaggio denaro |
| 7. Appalti Turismo & B2B-> Validazione flotta reale DB e cauzioni di garanzia      |
| 8. Executive Club Shop  -> Tabella catalogo server-side (vietare p_amount client)  |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 3: MOLTIPLICATORI PERMANENTI & ASSET AD ALTO IMPATTO                         |
| (Obiettivo: Chiudere le alterazioni a lungo termine della progressione)          |
+-----------------------------------------------------------------------------------+
| 9. Costruzioni HQ       -> Tabella company_hq_rooms + RPC rpc_upgrade_hq_room      |
| 10. Showroom Auto       -> Tabella catalogo veicoli DB (prezzo fisso autoritativo) |
| 11. Assunzione Autisti  -> Tabella stipendi minimi per tier su rpc_hire_driver     |
| 12. Prestiti Bancari    -> Piani ammortamento e rate calcolate dal server          |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 4: OPERAZIONI QUOTIDIANE FLOTTA & LOGISTICA                                  |
| (Obiettivo: Uniformare tutte le spese operative sul layer RPC)                   |
+-----------------------------------------------------------------------------------+
| 13. Riparazioni flotta  -> Calcolo costo basato su (100 - condition) in SQL        |
| 14. Rifornimenti        -> Calcolo costo basato su fuel_market.price_eur           |
| 15. Sblocco Regioni     -> Costi di licenza fissati in SQL                        |
| 16. Deposito & Gomme    -> RPC unificata per acquisti logistici                    |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 5: LEDGER ECONOMICO COMPLETO (FINAL LOCKDOWN)                                |
| (Obiettivo: Attivare il trigger di blocco totale su companies.cash)               |
+-----------------------------------------------------------------------------------+
| 17. Migrazione Borsa, Crypto e Contratti a Ledger (42_economy_ledger_scaffold.sql) |
| 18. Deprecazione totale di rpc_sync_cash e attivazione enforcement BEFORE UPDATE   |
+-----------------------------------------------------------------------------------+
```

### Perché questo ordine?
1. **Fase 1 (Valuta Reale & Faucet):** Protegge immediatamente gli introiti aziendali (Stripe) e chiude le voragini da cui un giocatore può generare decine di milioni con un click (`sell_vehicle`, `start_trip`).
2. **Fase 2 (Multiplayer):** Un exploit in single-player rovina solo la partita dell'imbroglione; un exploit in P2P/Aste/Turismo danneggia e fa abbandonare i giocatori paganti onesti.
3. **Fase 3 (Moltiplicatori HQ & Flotta):** Blocca i vantaggi permanenti che inquinano le classifiche globali.
4. **Fase 4 (Micro-operazioni):** Rifinitura del gameplay quotidiano.
5. **Fase 5 (Chiusura Definitiva):** Con tutte le transazioni coperte, si può finalmente blindare `companies.cash` con trigger rigidi che rifiutano qualsiasi scrittura non proveniente da una RPC autorizzata.
