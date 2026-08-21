# Mappa delle Transazioni — Analisi e Piano di Migrazione verso un'Economia Server-Authoritative

> **Scopo del documento:** Fornire a Vlad l'analisi completa di ogni azione di gioco che muove denaro (cash, Driver Coins, VTK, asset), evidenziando lo stato attuale del flusso, le vulnerabilità rispetto alla manipolazione client (imbroglio), cosa controllano o non controllano le RPC esistenti nei file `.sql`, cosa serve per rendere ciascuna transazione autoritativa lato server, e l'ordine di priorità consigliato per l'intervento.
>
> **Copertura del censimento:** Flotta & Manutenzione, Corse & Missioni, Risorse Umane & Autisti, Executive Club (DC), Finanza & Prestiti, Territorio & Immobili, Aste & Mercato P2P, Contratti B2B, Turismo & Appalti, Mercato Azionario / Holding / OPA, Sindacato & Shadow Ops & Crypto.

---

## 1. Flotta, Garage e Manutenzione

### 1.1 Riparazione veicolo (`payToRepairCar`)
- **File coinvolti:** `engine.js`, `engine-fleet.js`, `serverState.js`, `02_mmo_rpcs_extension.sql`.
- **Come si muove oggi:** Ibrido. Il client calcola il costo tramite `repairCostFor(condition)`, chiama `CE_money.spend(cost)` (che invia `rpc_sync_cash`), e invoca `ServerState.repairVehicle(id, cost)` (`rpc_repair_vehicle`).
- **Cosa controlla la RPC attuale:**
  - `auth.uid() IS NOT NULL` (utente autenticato);
  - `v_cost >= 0` (costo non negativo);
  - Lock riga azienda `FOR UPDATE`;
  - Proprietà del veicolo (`company_id = v_company.id`);
  - Stato del veicolo valido: deve essere `IDLE` o `MAINTENANCE`;
  - Capienza cassa: `v_company.cash >= v_cost`;
  - Transazione atomica: addebita `cash` e imposta `condition = 100, tire_pressure = 100, status = 'IDLE'`.
- **Cosa NON controlla:**
  - Il parametro `v_cost` è fornito dal client. La RPC non ricalcola il costo in base al danno effettivo (`100 - condition`): un client manipolato può passare `v_cost = 0` o `1` e riparare integralmente qualsiasi veicolo a costo nullo.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Il server deve calcolare il costo autonomamente: `cost = (100 - vehicle.condition) * COST_PER_HP * multiplier` senza accettare `v_cost` come input dal client.
- **Gravità imbroglio:** **Media**. Consente manutenzione flotta gratuita nel single/multiplayer, riducendo i costi operativi ma senza iniettare nuovo contante netto nel sistema.

---

### 1.2 Rifornimento carburante (`buyFuelForDepot`, `emergencyRefuel`, `buyStandardFuel`)
- **File coinvolti:** `engine-fleet.js`, `infrastructure.js`, `serverState.js`, `02_mmo_rpcs_extension.sql`, `09_provinces_realestate_fuel.sql`.
- **Come si muove oggi:** Flusso duplice. Il rifornimento veicolo singolo chiama `ServerState.refuelVehicle` (`rpc_refuel_vehicle`); i rifornimenti di cisterna/deposito usano `CE_money.spend()` con mirror via `syncCash`.
- **Cosa controlla la RPC attuale (`rpc_refuel_vehicle`):**
  - Autenticazione, proprietà del veicolo, costo non negativo, capienza saldo azienda `cash >= v_cost`.
  - Incrementa il carburante (`fuel_level = LEAST(100, fuel_level + v_fuel_amount)`).
- **Cosa NON controlla:**
  - Non valida né `v_fuel_amount` né `v_cost` contro il prezzo ufficiale al litro della regione o del fornitore; un client può iniettare 100 litri pagando €0.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Ricevere solo `vehicle_id` e `liters_requested`; determinare il prezzo al litro interrogando la tabella prezzi server (`fuel_prices` / monopoli provinciali) e addebitare il totale esatto.
- **Gravità imbroglio:** **Media**. Carburante infinito a costo zero.

---

### 1.3 Acquisto veicolo da concessionario / catalogo (`buyCar`, `rpc_buy_vehicle`)
- **File coinvolti:** `engine-fleet.js`, `dispatcher.js`, `01_mmo_migration.sql`.
- **Come si muove oggi:** Chiama `ServerState.buyVehicle` (`rpc_buy_vehicle`), poi allinea lo stato locale.
- **Cosa controlla la RPC attuale (`rpc_buy_vehicle`):**
  - Autenticazione, lock riga `companies`, capienza fondi `cash >= v_price`.
  - Inserisce la riga in `public.vehicles` e scala `cash`.
- **Cosa NON controlla:**
  - `v_price`, `v_model`, `v_class` sono tutti parametri passati dal client. Non c'è verifica contro un catalogo immutabile sul server: un utente può comprare un'auto di lusso da €150.000 dichiarando `v_price = 1`.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Input: solo `model_id`. Il server legge classe, specifiche e prezzo ufficiale da `vehicle_catalog` (tabella non modificabile), verifica i requisiti di livello/prestigio e addebita il prezzo di listino.
- **Gravità imbroglio:** **Alta**. Permette la generazione di flotte immense con spesa irrisoria, sbilanciando la classifica e le aste P2P.

---

### 1.4 Vendita veicolo a concessionario / rottamazione (`rpc_sell_vehicle`)
- **File coinvolti:** `09_provinces_realestate_fuel.sql`, `serverState.js`.
- **Come si muove oggi:** RPC autoritativa sul server (`rpc_sell_vehicle`).
- **Cosa controlla la RPC attuale:**
  - Proprietà del veicolo, stato non `DRIVING`/`IN_AUCTION`.
  - Calcola il valore di realizzo sul server (prezzo base deprezzato per chilometri e usura) e accredita la cassa aziendale.
- **Cosa NON controlla:**
  - Se il prezzo d'acquisto originale memorizzato nel record veicolo era stato falsificato alla creazione, la vendita calcola il rimborso su un valore alterato.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Usare il valore di listino server del modello come base di svalutazione anziché campi non protetti.
- **Gravità imbroglio:** **Media**.

---

### 1.5 Upgrade veicolo (`rpc_buy_vehicle_upgrade`, Telepass)
- **File coinvolti:** `engine-fleet.js`, `serverState.js`, `02_mmo_rpcs_extension.sql`.
- **Come si muove oggi:** Chiama `rpc_buy_vehicle_upgrade` o `rpc_toggle_telepass`.
- **Cosa controlla la RPC attuale:**
  - Proprietà veicolo, stato `IDLE`, upgrade non già presente nell'array `upgrades`, `cash >= v_cost`.
- **Cosa NON controlla:**
  - Il costo `v_cost` è passato dal client.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Verificare il costo dell'upgrade da una costante SQL / tabella cataloghi.
- **Gravità imbroglio:** **Bassa/Media**.

---

## 2. Corse, Missioni e Guadagni Operativi

### 2.1 Incasso corsa standard / Taxi (`engine-rides.js`, `rpc_claim_trip_reward`)
- **File coinvolti:** `engine-rides.js`, `01_mmo_migration.sql`, `16_territory_war.sql`.
- **Come si muove oggi:** Ibrido/Client-authoritative per la simulazione standard (`CE_money.earn(earned, 'ride_earnings')` -> `syncCash`). Per le corse MMO sincronizzate: `rpc_start_trip` -> attesa tempo -> `rpc_claim_trip_reward`.
- **Cosa controlla la RPC attuale (`rpc_claim_trip_reward`):**
  - Esistenza del trip, stato `IN_PROGRESS`, appartenenza all'azienda, timestamp di completamento rispettato (`now() >= estimated_arrival`).
  - Accredita il `reward_cash` memorizzato nella tabella `trips` al momento dell'avvio.
- **Cosa NON controlla:**
  - Nella creazione del trip (`rpc_start_trip`), parametri come `reward_cash`, `reward_xp`, `distance_km` possono provenire dal client se non generati interamente da seed server.
  - La maggior parte delle corse nel single-player/offline viaggia solo su `CE_money.earn()` locale e fa il push del totale via `syncCash`.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Generazione autoritativa della corsa sul server (calcolo tariffa basato su coordinate, classe veicolo, abilità autista, condizioni meteo/traffico) e chiusura con verifica dei tempi minimi di percorrenza.
- **Gravità imbroglio:** **Alta**. È la fonte primaria di cash del gioco; la manipolazione locale permette di iniettare milioni di euro con cicli artificiali.

---

### 2.2 Mance, Drop e Scelte Narrative / Bivi Quest (`quests-data.js`, `quests.js`)
- **File coinvolti:** `quests-data.js`, `engine-rides.js`.
- **Come si muove oggi:** Totalmente client-authoritative: `CE_money.earn(5000, 'quest_bivio')`, `CE_money.earn(150000, 'quest_bivio')`, `CE_money.earnDC(drop, 'ultra_ride_drop')` -> `syncCash`.
- **Cosa controlla la RPC attuale:** Nessuna RPC dedicata. Il client decide quando scatta l'evento e quale importo aggiungere.
- **Cosa dovrebbe controllare una RPC sicura (`rpc_claim_quest_choice`):**
  - Stato della quest per l'utente, verifica che il nodo narrativo sia attivo e non già riscattato, erogazione atomica del reward (cash/DC/reputazione) definito nel template server.
- **Gravità imbroglio:** **Alta** (specialmente per i drop di Driver Coins e reward da €150.000).

---

## 3. Risorse Umane e Gestione Autisti

### 3.1 Assunzione autista (`hireDriver`, `rpc_hire_driver`)
- **File coinvolti:** `engine-drivers.js`, `serverState.js`, `02_mmo_rpcs_extension.sql`.
- **Come si muove oggi:** `CE_money.spend(cost, 'hire_driver')` e chiamata a `ServerState.hireDriver(name, salary, skillLevel)`.
- **Cosa controlla la RPC attuale:**
  - `salary >= 0`, capienza cassa per anticipo assunzione (`cash >= salary * 2`), inserisce l'autista in `public.drivers`.
- **Cosa NON controlla:**
  - `salary` è deciso dal client: un giocatore può assumere un autista di livello massimo (Master) con `salary = 0` o `1`.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tabella pool autisti generata sul server con stipendi legati al livello di abilità; l'assunzione deve passare per `driver_market_id`.
- **Gravità imbroglio:** **Media**.

---

### 3.2 Stipendi giornalieri, Corsi Academy e Azzeramento Stress
- **File coinvolti:** `engine-drivers.js`, `engine-daily.js`.
- **Come si muove oggi:** Client-authoritative tramite `CE_money.spend()` per corsi e bonus, e detrazione aggregata nel tick giornaliero `engine-daily.js`.
- **Cosa controlla la RPC attuale:** Nessuna RPC.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tick giornaliero centralizzato (o calcolato lato server al login) che deduce il monte stipendi in base agli autisti registrati su DB.
- **Gravità imbroglio:** **Bassa/Media**.

---

## 4. Executive Club e Valuta Premium (Driver Coins)

### 4.1 Accredito Driver Coins (`rpc_add_driver_coins`, Shop / Acquisti Reali)
- **File coinvolti:** `money.js`, `serverState.js`, `05_mmo_driver_coins.sql`, `17_executive_club.sql`, `41_cap_driver_coins.sql`, `43_ratelimit_driver_coins.sql`.
- **Come si muove oggi:** Il client invoca `CE_money.earnDC()` che chiama `ServerState.addDriverCoins()` (`rpc_add_driver_coins`).
- **Cosa controlla la RPC attuale:**
  - Autenticazione, cap massimo per singola chiamata (1.000.000 DC post patch 41), rate limiting (patch 43).
- **Cosa NON controlla:**
  - **NON verifica la ricevuta di pagamento reale (es. Stripe/Apple Pay/Google Play)**. Qualsiasi utente autenticato può invocare la RPC direttamente dalla console browser e accreditarsi Driver Coins gratis fino al cap.
- **Cosa dovrebbe controllare una RPC sicura:**
  - La RPC `rpc_add_driver_coins` **NON deve essere invocabile dal client (`REVOKE EXECUTE FROM authenticated, anon`)**. Deve essere eseguita esclusivamente da un webhook server-side backend verificato con firma crittografica Stripe dopo l'avvenuto pagamento in valuta reale.
- **Gravità imbroglio:** **CRITICA ASSOLUTA**. Coinvolge denaro reale, modello di business e potenziale frode finanziaria/legale.

---

### 4.2 Spesa Driver Coins (`spendDC`, `rpc_ec_spend`, Booster, Instant Heal, Bundle)
- **File coinvolti:** `money.js`, `engine-store.js`, `serverState.js`, `17_executive_club.sql`, `51_lockdown_driver_coins_negative_cost_scaffold.sql`.
- **Come si muove oggi:** `CE_money.spendDC()` scala localmente e chiama `rpc_ec_spend` (o RPC specifiche `rpc_buy_fleet_repair`, `rpc_upgrade_offline_limit`, ecc.).
- **Cosa controlla la RPC attuale:**
  - Autenticazione, lock riga `companies`, saldo `driver_coins >= p_amount`, protezione da importi negativi (patch 51). Ritorna il nuovo saldo DC autoritativo.
- **Cosa NON controlla:**
  - Se il costo `p_amount` è inviato dal client anziché validato contro la tabella prezzi degli item Executive Club.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Ricevere `item_id`; leggere il costo in DC dal catalogo server; applicare l'effetto atomico sul DB (sblocco perenne, reset stato flotta, ecc.).
- **Gravità imbroglio:** **Alta** (se i DC sono stati ottenuti legittimamente con acquisto reale, il bypass dei costi distrugge la monetizzazione).

---

## 5. Finanza, Prestiti, Investimenti e Tasse

### 5.1 Richiesta e Rimborso Prestiti Bancari (`rpc_take_loan`, `rpc_repay_loan`)
- **File coinvolti:** `serverState.js`, `02_mmo_rpcs_extension.sql`, `engine-daily.js`.
- **Come si muove oggi:** Chiama `rpc_take_loan` / `rpc_repay_loan`. I rimborsi rateali giornalieri sono calcolati anche nel loop client.
- **Cosa controlla la RPC attuale (`rpc_take_loan`):**
  - Autenticazione, max 3 prestiti attivi contemporanei, lock cassa, inserimento in `company_loans` e accredito immediato `cash = cash + v_amount`.
- **Cosa NON controlla:**
  - `v_amount`, `v_interest_rate`, `v_daily_payment` sono scelti dal client! Un utente può chiedere un prestito da €10.000.000 con tasso 0% e rata giornaliera di €0.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tagli di prestito prefissati calcolati dal server in base al merito creditizio/valore netto dell'azienda (equity); rate e interessi calcolati rigorosamente lato SQL.
- **Gravità imbroglio:** **Critica**. Consente l'accredito istantaneo di liquidità illimitata su DB.

---

### 5.2 Investimenti Passivi & Venture Capital (`rpc_buy_investment`, dividendi)
- **File coinvolti:** `02_mmo_rpcs_extension.sql`, `engine-daily.js`, `engine-finance.js`.
- **Come si muove oggi:** Acquisto tramite `rpc_buy_investment`; incasso rendite tramite calcolo locale `CE_money.earn()` nel tick giornaliero.
- **Cosa controlla la RPC attuale:**
  - Unicità dell'investimento (`investment_id`), capienza fondi `cash >= v_cost`.
- **Cosa NON controlla:**
  - `v_cost` è fornito dal client; l'incasso dei dividendi giornalieri non è convalidato dal server.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Catalogo server degli investimenti; calcolo batch o on-demand dei dividendi con verifica dell'ultimo timestamp di riscossione.
- **Gravità imbroglio:** **Alta**.

---

## 6. Territorio, Immobili e Infrastrutture

### 6.1 Conquista Province & Influenza Territoriale (`rpc_acquire_province`, `addProvinceInfluence`)
- **File coinvolti:** `09_provinces_realestate_fuel.sql`, `16_territory_war.sql`, `ui-ops.js`.
- **Come si muove oggi:** RPC autoritativa sul server con addebito cassa.
- **Cosa controlla la RPC attuale:**
  - Calcola costo base provincia, controlla influenza della holding/giocatore, verifica capienza cassa, aggiorna governatore e preleva fondi.
- **Cosa NON controlla:**
  - Alcuni moltiplicatori di influenza possono essere spammati se il client manipola le azioni di supporto locali.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Rate limiting sulle contese territoriali e validazione unificata delle quote di controllo.
- **Gravità imbroglio:** **Alta** (impatto diretto sulla leaderboard multiplayer e sui tributi riscossi dagli altri giocatori).

---

### 6.2 Immobili e Rendite di Affitto (`rpc_buy_real_estate`, `rpc_credit_real_estate_rents`)
- **File coinvolti:** `09_provinces_realestate_fuel.sql`, `31_realestate_expansion.sql`.
- **Come si muove oggi:** RPC `rpc_buy_real_estate` e `rpc_credit_real_estate_rents`.
- **Cosa controlla la RPC attuale:**
  - Disponibilità dell'immobile, lock azienda, `cash >= cost`. La riscossione affitti accredita sul server in base agli immobili posseduti.
- **Cosa NON controlla:**
  - Nelle prime versioni il costo dell'immobile era parzialmente desunto dai parametri client.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Prezzi e rendite ancorati alla tabella fissa `real_estate_catalog`.
- **Gravità imbroglio:** **Media**.

---

### 6.3 Depositi Carburante e Monopolio (`rpc_buy_fuel_depot`, `rpc_pay_fuel_levy`)
- **File coinvolti:** `29_infrastructure_monopoly.sql`, `infrastructure.js`.
- **Come si muove oggi:** RPC su DB con prelievo cassa.
- **Cosa controlla la RPC attuale:**
  - Verifica proprietà slot deposito, fondi necessari, imposta markup e gestisce il prelievo delle accise.
- **Gravità imbroglio:** **Media**.

---

## 7. Aste Giudiziarie e Mercato P2P Veicoli

### 7.1 Offerta e Aggiudicazione Aste Giudiziarie (`rpc_place_auction_bid`, `rpc_claim_auction`)
- **File coinvolti:** `auctions.js`, `20_judicial_auctions.sql`, `62_aste_ciclo_di_vita.sql`.
- **Come si muove oggi:** RPC autoritativa su DB. Il client usa `CE_money.accreditatoDalServer` per riallineare il display locale.
- **Cosa controlla la RPC attuale:**
  - Stato asta `ACTIVE`, `bid_amount >= current_bid + min_increment`, capienza fondi offerente, blocco fondi in escrow, rimborso automatico dell'offerente superato.
  - Al riscatto (`rpc_claim_auction`): verifica vincitore effettivo, scadenza timestamp, trasferimento veicolo/asset e sblocco definitivo del saldo.
- **Cosa NON controlla:**
  - Ottima implementazione: è uno dei sistemi più robusti del backend.
- **Gravità imbroglio:** **Critica se violata** (ma attualmente protetta dalle RPC di lifecycle aste).

---

### 7.2 Compravendita Auto tra Giocatori (P2P Marketplace)
- **File coinvolti:** `p2p-market.js`, `08_mmo_p2p_marketplace.sql`, `52_fix_p2p_sindacato_cash_source_of_truth.sql`.
- **Come si muove oggi:** `rpc_list_car_for_sale` -> `rpc_buy_market_car`.
- **Cosa controlla la RPC attuale:**
  - Proprietà venditore, veicolo spostato in stato escrow (`MARKET_ESCROW`), acquirente != venditore, acquirente ha `cash >= price`.
  - Trasferimento atomico: scala cash da acquirente, accredita cash su venditore, cambia `company_id` del veicolo.
- **Cosa NON controlla:**
  - Trasferimenti a prezzo simbolico (€1) o fuori mercato tra account secondari (wash trading / money transfer tra account).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Limite di prezzo minimo (es. non sotto il 50% del valore di rottamazione) e tassa di transazione P2P non eludibile.
- **Gravità imbroglio:** **Alta** (trasferimento fondi tra account multi-account).

---

## 8. Contratti B2B e Appalti Turistici

### 8.1 Contratti B2B (`rpc_accept_b2b_contract`, `rpc_b2b_daily_tick`, penali)
- **File coinvolti:** `b2b.js`, `19_b2b_contracts.sql`.
- **Come si muove oggi:** RPC `rpc_accept_b2b_contract`, elaborazione giornaliera SLA e payout su DB.
- **Cosa controlla la RPC attuale:**
  - Requisiti di flotta, deposito cauzionale, rispetto SLA per veicolo, calcolo penali per ritardi/guasti.
- **Cosa NON controlla:**
  - La generazione iniziale dei contratti disponibili su client (`contracts.js`) presentava duplicazioni con logiche non sincronizzate.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Generazione centralizzata delle offerte B2B con firma temporale.
- **Gravità imbroglio:** **Media**.

---

### 8.2 Gare e Appalti Turistici (`rpc_submit_tourism_bid`, `rpc_tourism_daily_tick`)
- **File coinvolti:** `tourism.js`, `33_tourism_tenders.sql`.
- **Come si muove oggi:** RPC server per sottomissione offerta e tick payout.
- **Cosa controlla la RPC attuale:**
  - Verifica requisiti tender (stelle hotel, numero veicoli idonei, capienza cassa per cauzione), selezione vincitore a scadenza, pagamenti periodici.
- **Gravità imbroglio:** **Media**.

---

## 9. Mercato Azionario, Holding, Dividendi e OPA

### 9.1 Quotazione IPO, Compravendita Azioni e Dividendi
- **File coinvolti:** `p2p-market.js`, `08_mmo_p2p_marketplace.sql`, `52_*`, `57_*`, `64_dividendi_giornalieri_idempotenti.sql`.
- **Come si muove oggi:** RPC `rpc_list_company_ipo`, `rpc_buy_company_shares`, `rpc_sell_company_shares`, `rpc_daily_dividends`.
- **Cosa controlla la RPC attuale:**
  - Tassa quotazione €50.000, reputazione minima >= 3.5, lock azionariato, capienza cassa acquirente, idempotenza giornaliera dividendi (patch 64).
- **Cosa NON controlla:**
  - Valutazione azionaria basata su cassa dichiarata (se la cassa è gonfiata via client prima dell'IPO, il valore dell'azione risulta artificialmente alto).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Calcolo del valore aziendale solo su asset convalidati (veicoli, immobili registrati) e non sul saldo cash volatile finché non vige il ledger.
- **Gravità imbroglio:** **Alta**.

---

### 9.2 OPA Ostile e Buyback Difensivo (`rpc_opa_buyback`, `rpc_pay_majority_dividend`)
- **File coinvolti:** `hostile_takeover.js`, `27_hostile_takeovers.sql`.
- **Come si muove oggi:** RPC dedicata con sincronizzazione client via `CE_money.addebitatoDalServer`.
- **Cosa controlla la RPC attuale:**
  - Quota di maggioranza (>50%), calcolo premio di liquidazione, prelievo forzoso o acquisto azioni sul server.
- **Gravità imbroglio:** **Alta** (impatto distruttivo su aziende di altri giocatori reali).

---

## 10. Sindacato, Operazioni Ombra e Crypto Offshore

### 10.1 Sindacato: Don Carmine, Crumiri, Scioperi (`15_sindacato_mechanics.sql`)
- **File coinvolti:** `15_sindacato_mechanics.sql`, `engine-drivers.js`, `sindacato.js`.
- **Come si muove oggi:** RPC per meccaniche server (`rpc_pay_don_carmine`, `rpc_hire_crumiri`, `rpc_dampen_tension`), con fallback legacy client in alcuni menu.
- **Cosa controlla la RPC attuale:**
  - Fondi disponibili, tensione corrente, decremento rischio GdF.
- **Gravità imbroglio:** **Bassa/Media**.

---

### 10.2 Operazioni Ombra & Spionaggio (`rpc_execute_shadow_op`, Difese)
- **File coinvolti:** `black_ops.js`, `23_shadow_ops.sql`.
- **Come si muove oggi:** RPC su DB.
- **Cosa controlla la RPC attuale:**
  - Costo dell'operazione, cooldown bersaglio, calcolo RNG successo/fallimento su DB, applicazione danni/furto al bersaglio.
- **Gravità imbroglio:** **Media/Alta**.

---

### 10.3 Crypto & Conti Offshore (`rpc_buy_crypto`, `rpc_sell_crypto`, `rpc_deposit_offshore`)
- **File coinvolti:** `crypto.js`, `24_crypto_offshore.sql`.
- **Come si muove oggi:** RPC dedicate con allineamento client via `CE_money.accreditatoDalServer` / `addebitatoDalServer`.
- **Cosa controlla la RPC attuale:**
  - Verifica saldo cassa / saldo crypto, prezzi correnti calcolati lato server, applicazione commissioni e rischio sequestro GdF.
- **Gravità imbroglio:** **Alta** (se combinato con iniezione di cash client).

---

## 11. Il Quadro di Sintesi: Vulnerabilità Architetturali Globali

Oggi l'economia ha una struttura a due livelli con una contraddizione di fondo:
1. **La Porta Unica Locale (`money.js` / `CE_money`):** Ha eliminato la discrepanza accidentale tra i moduli JS, convogliando tutte le variazioni verso `rpc_sync_cash`.
2. **Il Limite di `rpc_sync_cash`:** È un'operazione di `SET cash = v_cash` incondizionata. Il server riceve un numero e lo scrive nella colonna `companies.cash`. Qualsiasi utente che apra i DevTools o scripti una richiesta HTTP può inviare `{ v_cash: 999999999999 }` e il database lo accetta.
3. **I Parametri Fiduciari nelle RPC Esistenti:** Molte RPC controllano sì che `cash >= v_cost`, ma prendono `v_cost` o `v_price` come input fornito dal client (es. acquisto auto, riparazione veicolo, prestiti bancari), consentendo sconti arbitrari o minting tramite prestiti non congrui.

---

## 12. Lista Ordinata delle Priorità di Intervento (Roadmap per Vlad)

Per massimizzare la sicurezza con il minor impatto sullo sviluppo, l'intervento deve seguire questo ordine rigoroso:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: CRITICITÀ ASSOLUTA — Monetizzazione Reale & Minting Arbitrario      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Revoca di rpc_add_driver_coins dal ruolo 'authenticated'.                │
│    I DC devono essere coniati SOLO da webhook Stripe backend validati.       │
│ 2. Blindatura rpc_take_loan: calcolo importo e rata gestiti al 100% in SQL.  │
│ 3. Attivazione ledger e blocco rpc_sync_cash (migrazione a delta autoritativi).│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: RISCHIO ELEVATO — Sistemi MMO Competitivi & Mercato P2P             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Catalogo server per rpc_buy_vehicle e rpc_buy_vehicle_upgrade.           │
│ 5. Formula autoritativa per rpc_repair_vehicle (costo calcolato su danno).  │
│ 6. Validazione anti-wash trading nel marketplace P2P (auto e azioni IPO).   │
│ 7. Blindatura calcolo dividendi e OPA ostili.                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: RISCHIO MEDIO — Core Loop Corse & Appalti                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 8. Validazione server su rpc_start_trip / rpc_claim_trip_reward (anti-speed)│
│ 9. Calcolo centralizzato stipendi autisti e tick contratti B2B / Turismo.   │
│ 10. Prezzi carburante e monopolio infrastrutture ancorati al server.       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 4: RISCHIO BASSO — Flavor Narrativo & Micro-Eventi Single Player       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 11. Scelte quest, bivi narrativi e mance occasionali.                       │
│ 12. Azzeramento stress, hotel CEO e minuzie cosmetiche.                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Perché questo ordine:
1. **Tier 1 prima di tutto:** I Driver Coins rappresentano valore economico reale (euro spesi dai clienti). Se un utente può mintare DC o generare 100 milioni di euro con un prestito a tasso zero, l'intera economia collassa all'istante.
2. **Tier 2 protegge il multiplayer:** Se i giocatori onesti competono con utenti che comprano supercar a €1 o riparano la flotta gratis, l'ecosistema MMO e il mercato P2P perdono credibilità.
3. **Tier 3 e 4 possono convivere temporaneamente con tetti di guardia (`_econ_cap` in `42_economy_ledger_scaffold.sql`):** Le corse e le quest possono continuare a generare delta monitorati da trigger anti-anomalia prima di riscrivere l'intero dispatcher in modalità 100% server-authoritative.
