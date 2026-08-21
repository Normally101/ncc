# Mappa delle Transazioni Economiche e Piano Anti-Cheat

> **Destinatario:** Decisione Architetturale (Vlad)  
> **Scopo:** Mappare tutte le azioni di gioco che muovono denaro o valute, analizzare la sicurezza attuale lato server, evidenziare cosa manca per renderle a prova di manipolazione (server-authoritative) e definire un ordine di priorità di implementazione.  
> **Riferimenti di codice:** `money.js`, `serverState.js`, schema SQL (`01_*` .. `64_*`), `docs/ECONOMY_SERVER_AUTH.md`, `docs/DOPPIO-CONTEGGIO.md`.

---

## Stato dell'Arte e Architettura Attuale

Nel modello odierno, la cassa opera secondo un meccanismo ibrido di transizione:
1. **Simulazione Client-Authoritative:** Il browser calcola il saldo locale (`gameState.cash`) e lo invia al server tramite `ServerState.syncCash(cash)` che chiama `rpc_sync_cash(v_cash)`.
2. **Accettazione Incondizionata:** `rpc_sync_cash` esegue un `UPDATE companies SET cash = v_cash` senza verificare la provenienza o la legittimità delle variazioni.
3. **Scopo risolto vs Scopo aperto:** Questo sistema ha risolto la **divergenza** (perdita di progressi o acquisti fantasma al reload), ma lascia completamente scoperta la protezione dall'**imbroglio** (chiunque apra la DevTools Console può impostare `gameState.cash = 999999999` e vederlo sincronizzato sul database MMO).

---

## Mappa Dettagliata delle Transazioni

---

### 1. Flotta e Garage

#### 1.1 Acquisto Veicolo Standard da Catalogo
- **Come si muove oggi:** `CE_money.spend` lato client e/o chiamata RPC `ServerState.buyVehicle` &rarr; `rpc_buy_vehicle(v_model_id, v_price, v_hq_city)` (`01_mmo_migration.sql:184`).
- **Cosa controlla la RPC attuale:**
  - Utente autenticato ed esistenza del record `companies` per l'utente.
  - `v_price >= 0`.
  - `companies.cash >= v_price` (con blocco pessimistico `SELECT FOR UPDATE`).
  - Genera targa italiana e inserisce la riga in `vehicles` con stato `IDLE`.
- **Cosa NON controlla:**
  - **Non confronta `v_price` con alcun listino server!** Il prezzo viene fornito interamente come parametro dal browser. Un client manomesso può inviare `v_price = 0` o `v_price = 1` e acquistare qualsiasi ammiraglia o veicolo ultra.
  - Non valida se `v_model_id` appartiene al catalogo dei modelli ammessi.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Consultare una tabella/catalogo server con i prezzi base dei veicoli.
  - Applicare sconti (es. perk alleanza, reputazione) calcolati esclusivamente dal database.
  - Verificare limiti di capienza del garage/flotta aziendale.
- **Gravità Imbroglio:** **MEDIA**. Genera parco auto gratuito alterando la progressione, ma non inietta cassa liquida direttamente.

#### 1.2 Vendita Veicolo Usato
- **Come si muove oggi:** RPC `ServerState.sellVehicle` &rarr; `rpc_sell_vehicle(v_vehicle_id, v_price)` (`09_provinces_realestate_fuel.sql:394`) oppure `CE_money.earn` nel client locale.
- **Cosa controlla la RPC attuale:**
  - Utente autenticato ed esistenza dell'azienda.
  - Proprietà del veicolo (`company_id = v_company.id`) e stato `IDLE`.
  - Elimina il record del veicolo e accredita `v_price` su `companies.cash`.
- **Cosa NON controlla:**
  - **Nessuna validazione su `v_price`!** `v_price` è un parametro arbitrario del client.
  - Una chiamata con `v_price = 500000000` (€500M) viene eseguita ed accreditata senza eccezioni.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Calcolare il valore di vendita lato server basandosi su: prezzo base del modello a listino, chilometraggio accumulato (`mileage`), condizione meccanica (`condition`), età del veicolo e livello di usura.
- **Gravità Imbroglio:** **CRITICA / MASSIMA**. Rappresenta un varco diretto di minting monetario istantaneo con una sola riga di codice.

#### 1.3 Riparazione Carrozzeria e Manutenzione
- **Come si muove oggi:** `CE_money.spend` client (canonica: `payToRepairCar`) e/o `ServerState.repairVehicle` &rarr; `rpc_repair_vehicle(v_vehicle_id, v_cost)` (`02_mmo_rpcs_extension.sql:732`).
- **Cosa controlla la RPC attuale:**
  - Autenticazione ed esistenza azienda.
  - `v_cost >= 0`.
  - Proprietà del veicolo e stato in `('IDLE', 'MAINTENANCE')`.
  - `companies.cash >= v_cost`.
  - Ripristina `condition = 100`, `tire_pressure = 100` e stato ad `IDLE`.
- **Cosa NON controlla:**
  - Non calcola la spesa in base ai danni effettivi (`100 - condition`). Il parametro `v_cost` è accettato a fiducia (`v_cost = 0` ripara gratis qualsiasi veicolo).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Calcolo server del costo: `(100 - condition) * tariffa_punto_danno`, applicando eventuali bonus HQ verificati server-side.
- **Gravità Imbroglio:** **BASSA**. Permette manutenzione gratuita ma non impatta i saldi complessivi dell'economia.

#### 1.4 Rifornimento Carburante
- **Come si muove oggi:** `CE_money.spend` client locale / `ServerState.refuelVehicle` &rarr; `rpc_refuel_vehicle(v_vehicle_id, v_fuel_amount, v_cost)` (`02_mmo_rpcs_extension.sql:679`).
- **Cosa controlla la RPC attuale:**
  - Autenticazione, proprietà veicolo, `v_fuel_amount > 0`, `v_cost >= 0`, `companies.cash >= v_cost`.
  - Incrementa `fuel_level = LEAST(100, fuel_level + v_fuel_amount)`.
- **Cosa NON controlla:**
  - Non confronta `v_cost` con la tabella `fuel_market` (che traccia il prezzo al litro in tempo reale). Passare `v_cost = 0` esegue il pieno a costo zero.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Calcolare `costo = v_fuel_amount * fuel_market.price_eur`, verificando sconti derivanti da cisterne/depositi aziendali (`company_fuel_depots`).
- **Gravità Imbroglio:** **BASSA**. Riduce a zero i costi vivi di viaggio senza spostare equilibri sistemici.

#### 1.5 Upgrade Veicolo e Telepass
- **Come si muove oggi:** `CE_money.spend` client / `ServerState.buyVehicleUpgrade` &rarr; `rpc_buy_vehicle_upgrade` (`02_mmo_rpcs_extension.sql:235`) e `ServerState.toggleTelepass` &rarr; `rpc_toggle_telepass` (`02_mmo_rpcs_extension.sql:290`).
- **Cosa controlla la RPC attuale:**
  - Proprietà del veicolo e stato `IDLE`.
  - Verifica che l'upgrade non sia già presente nell'array `upgrades` (anti-duplicazione).
  - Fondi sufficienti `companies.cash >= v_price`.
- **Cosa NON controlla:**
  - Il prezzo `v_price` / `v_cost` è dettato dal client (`v_price = 0` installa l'upgrade gratis). Non valida se `v_upgrade_id` appartiene agli upgrade supportati.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Catalogo server degli upgrade con prezzi e compatibilità per modello.
- **Gravità Imbroglio:** **BASSA / MEDIA**.

---

### 2. Personale e Autisti

#### 2.1 Assunzione Autisti
- **Come si muove oggi:** `CE_money.spend` client / `ServerState.hireDriver` &rarr; `rpc_hire_driver(v_name, v_salary, v_tier)` (`02_mmo_rpcs_extension.sql:100`).
- **Cosa controlla la RPC attuale:**
  - Tier ammesso in `('STANDARD', 'BUSINESS', 'VIP', 'ULTRA')`.
  - `v_salary >= 0`.
  - Costo assunzione calcolato come `v_salary * 2`, con verifica fondi `cash >= v_hiring_cost`.
- **Cosa NON controlla:**
  - `v_salary` è stabilito dal client. Un utente può passare `v_salary = 0` per un autista di classe ULTRA (assunzione a €0 e stipendio giornaliero perpetuo a €0).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tabella di fasce retributive minime e costi di ingaggio per ciascun tier; generazione server delle statistiche dell'autista.
- **Gravità Imbroglio:** **MEDIA**. Genera staff gratuito ad alta resa.

#### 2.2 Licenziamento Autisti
- **Come si muove oggi:** `ServerState.fireDriver` &rarr; `rpc_fire_driver(v_driver_id)` (`02_mmo_rpcs_extension.sql:147`).
- **Cosa controlla la RPC attuale:**
  - Proprietà dell'autista, stato `AVAILABLE` (non impegnato in viaggio). Elimina il record.
- **Cosa NON controlla:** Non muove denaro (licenziamento senza buonuscita).
- **Cosa dovrebbe controllare una RPC sicura:** Eventuale penale di licenziamento calcolata lato server.
- **Gravità Imbroglio:** **NULLA**.

#### 2.3 Pagamento Costi Giornalieri e Stipendi
- **Come si muove oggi:** `engine-daily.js` &rarr; `processDailyRoutines` detrae localmente con `CE_money.spend` e invia `syncCash`. Esiste anche `rpc_collect_daily_costs()` (`02_mmo_rpcs_extension.sql:852`).
- **Cosa controlla la RPC attuale:**
  - Itera sui prestiti attivi in `company_loans` e deduce le rate giornaliere (`daily_payment`).
  - Itera sulle campagne marketing attive in `active_campaigns` e deduce `daily_cost`.
  - Applica le deduzioni con `cash = GREATEST(0, cash - v_total_deducted)`.
- **Cosa NON controlla:**
  - Non calcola la somma degli stipendi degli autisti dalla tabella `drivers` (attualmente lasciata alla routine locale del client).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Esecuzione lato server di un tick economico completo: stipendi totali autisti (`SUM(salary)`), manutenzione sedi, ammortamenti e marketing.
- **Gravità Imbroglio:** **MEDIA**. Se bypassato dal client, si evitano costi operativi giornalieri.

---

### 3. Corse, Viaggi e Contratti

#### 3.1 Avvio e Riscossione Corsa Ordinaria
- **Come si muove oggi:** Client locale calcola guadagno e accredita con `CE_money.earn`. Lato server MMO esistono `rpc_start_trip` (`01_mmo_migration.sql:245`) e `rpc_claim_trip_reward` (`01_mmo_migration.sql:360`).
- **Cosa controllano le RPC attuali:**
  - `rpc_start_trip`: verifica proprietà veicolo e autista, disponibilità (stati `IDLE` e `AVAILABLE`), co-locazione (stessa città di partenza).
  - `rpc_claim_trip_reward`: **controllo temporale anti-cheat lato server** (`IF now() < trip.end_time THEN RAISE EXCEPTION`), impedendo riscossioni premature; accredita `reward_cash`, aggiorna posizione e chilometraggio.
- **Cosa NON controllano:**
  - **`v_reward` e `v_duration_ms` sono forniti dal client in fase di `rpc_start_trip`!**
  - Un cheater può impostare `v_duration_ms = 1000` (1 secondo) e `v_reward = 100000000` (€100M). Dopo un secondo invoca `rpc_claim_trip_reward` e riceve l'intero importo.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Ricevere solo `(vehicle_id, driver_id, destination_city_id, client_tier)`.
  - Calcolare distanza e percorso tramite matrice chilometrica server.
  - Calcolare tariffa e compenso in base alla tariffa ufficiale per km, moltiplicatori di lusso e reputazione.
  - Determinare la durata in base alla velocità media del veicolo.
- **Gravità Imbroglio:** **CRITICA / MASSIMA**. È il motore primario del gioco: se il client definisce ricavi e durata, l'intera economia è aperta al cheating.

#### 3.2 Contratti Corporate B2B
- **Come si muove oggi:** `b2b.js` &rarr; `rpc_accept_b2b_contract`, `rpc_b2b_daily_tick`, `rpc_terminate_b2b_contract` (`19_b2b_contracts.sql`).
- **Cosa controllano le RPC attuali:**
  - I contratti sono precaricati su tabella server `b2b_contracts`.
  - Verifica reputazione minima aziendale (`reputation >= contract.min_reputation`).
  - `rpc_b2b_daily_tick` accredita `daily_payout` memorizzato a database se `next_payout_at <= now()`.
  - `rpc_terminate_b2b_contract` detrae la penale `penalty_amount` memorizzata a database.
- **Cosa NON controllano:**
  - I veicoli e gli autisti vincolati (`locked_vehicles`, `locked_drivers`) sono passati come stringhe JSON dal client e non vengono validati contro le tabelle `vehicles` e `drivers`.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Verificare che i veicoli vincolati appartengano all'azienda, abbiano il tier richiesto e rimangano nello stato `ASSIGNED_B2B`.
- **Gravità Imbroglio:** **MEDIA / ALTA**. Permette di intascare rendite passive senza bloccare realmente veicoli della propria flotta.

#### 3.3 Appalti Turismo e Grandi Eventi
- **Come si muove oggi:** `tourism.js` &rarr; `rpc_submit_tourism_bid`, `rpc_tourism_daily_tick` (`33_tourism_tenders.sql`).
- **Cosa controllano le RPC attuali:**
  - Aste e appalti censiti su tabella server `tourism_tenders`.
  - Accredito payout basato sui dati dell'appalto registrato su database.
- **Cosa NON controllano:**
  - Validazione reale dei requisiti di flotta (stesso debito del B2B).
- **Gravità Imbroglio:** **MEDIA**.

---

### 4. Finanza, Credito e Immobili

#### 4.1 Prestiti Bancari
- **Come si muove oggi:** `CE_money.earn`/`spend` locale; RPC `ServerState.takeLoan` &rarr; `rpc_take_loan` (`02_mmo_rpcs_extension.sql:406`) e `ServerState.repayLoan` &rarr; `rpc_repay_loan` (`02_mmo_rpcs_extension.sql:457`).
- **Cosa controllano le RPC attuali:**
  - `rpc_take_loan`: `principal > 0`, `daily_payment > 0`, `interest_rate >= 0`, tetto di massimo 3 prestiti simultanei in `company_loans`. Accredita `principal` sul conto `companies.cash`.
  - `rpc_repay_loan`: `amount > 0`, appartenenza del prestito, fondi sufficienti `cash >= repaid_amount`.
- **Cosa NON controllano:**
  - **I parametri `principal`, `interest_rate` e `daily_payment` sono passati dal client.** Un client può richiedere un prestito con capitale €100.000.000, tasso 0% e rata giornaliera di €1.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Pacchetti di prestito standardizzati o calcolo server del fido massimo in base a fatturato, asset liquidi e rating aziendale.
- **Gravità Imbroglio:** **CRITICA / MASSIMA**. Accesso immediato a capitale illimitato.

#### 4.2 Investimenti Passivi e Sblocco Regioni
- **Come si muove oggi:** `ServerState.buyInvestment` &rarr; `rpc_buy_investment` (`02_mmo_rpcs_extension.sql:186`) e `ServerState.unlockRegion` &rarr; `rpc_unlock_region` (`02_mmo_rpcs_extension.sql:518`).
- **Cosa controllano le RPC attuali:**
  - Unicità dell'acquisto (`UNIQUE(company_id, inv_id)` / `UNIQUE(company_id, region_id)`).
  - Fondi sufficienti `companies.cash >= v_price`.
- **Cosa NON controllano:**
  - `v_price` è passato dal client (`v_price = 0` sblocca gratuitamente qualsiasi potenziamento o regione).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tabella listino investimenti e licenze regionali lato database.
- **Gravità Imbroglio:** **MEDIA**.

#### 4.3 Mercato Immobiliare (Real Estate)
- **Come si muove oggi:** `ServerState.buyRealEstate` &rarr; `rpc_buy_real_estate(v_listing_id)` (`09_provinces_realestate_fuel.sql:222`).
- **Cosa controllano le RPC attuali:**
  - **ESEMPIO DI ECCELLENZA SERVER-AUTHORITATIVE:**
    - Cerca l'immobile nella tabella server `real_estate_listings`.
    - Legge `cost` direttamente dalla tabella (il client passa SOLO l'ID).
    - Verifica fondi `companies.cash >= listing.cost`.
    - Verifica che l'immobile non sia già posseduto.
    - Detrae `listing.cost` e inserisce il record in `company_real_estate`.
  - L'accredito delle rendite (`rpc_credit_real_estate_rents`) è accessibile solo tramite `service_role` e verifica il timestamp `last_rent_at`.
- **Cosa NON controlla:** Praticamente nulla: l'architettura di questo modulo è già corretta e sicura.
- **Gravità Imbroglio:** **NULLA**.

---

### 5. Mercato P2P, Aste Giudiziarie e Titoli Societari

#### 5.1 Compravendita Veicoli P2P tra Giocatori
- **Come si muove oggi:** `p2p-market.js` &rarr; `rpc_buy_market_car(v_listing_id)` (`52_fix_p2p_sindacato_cash_source_of_truth.sql:103`).
- **Cosa controlla la RPC attuale:**
  - Inserzione valida e non scaduta.
  - Divieto di acquisto della propria inserzione (`seller <> buyer`).
  - Lock ordinato anti-deadlock su entrambe le aziende.
  - Verifica fondi compratore (`cash >= ask_price`).
  - Detrazione 5% di tassa di sistema (money sink anti-inflazione).
  - Trasferimento netto al venditore e addebito al compratore su `companies.cash`.
- **Cosa NON controlla:**
  - Non vi sono tetti massimi al prezzo di inserzione impostato dal venditore in `rpc_list_car_for_sale`. Ciò consente il passaggio di fondi illeciti tra account collusi (money laundering tramite auto spazzatura vendute a prezzi spropositati).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tetto massimo di prezzo P2P (es. massimo 150% del valore stimato dell'auto).
- **Gravità Imbroglio:** **ALTA**.

#### 5.2 Aste Giudiziarie
- **Come si muove oggi:** `auctions.js` &rarr; `rpc_place_auction_bid`, `rpc_claim_auction` (`62_aste_ciclo_di_vita.sql`).
- **Cosa controllano le RPC attuali:**
  - `rpc_place_auction_bid`: Asta aperta e valida, offerta minima, cap massimo €100M, rate limit 10s, verifica fondi comprensiva delle offerte già impegnate su altri lotti aperti.
  - `rpc_resolve_auction` (riservata a cron/servizio): assegna al miglior offerente solvibile e addebita il saldo.
  - `rpc_claim_auction`: riscatto atomico (`claimed_at IS NULL`), accredito contanti se container direttamente a database.
- **Cosa NON controllano:**
  - Il veicolo vinto viene iniettato nel garage dal client (`gameState.fleet`), anziché essere creato direttamente come riga nella tabella `vehicles`.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Creazione diretta della riga in `vehicles` lato server.
- **Gravità Imbroglio:** **BASSA** (la parte monetaria è completamente protetta).

#### 5.3 Azioni Societarie, IPO e Dividendi
- **Come si muove oggi:** `rpc_buy_company_shares` (`52_fix_*`), `rpc_daily_dividends` (`64_*`).
- **Cosa controllano le RPC attuali:**
  - Quantità azioni disponibili, divieto auto-acquisto, lock ordinato buyer/issuer, verifica fondi, aggiornamento portafoglio `share_holdings`.
- **Cosa NON controllano:**
  - Parametri di quotazione IPO stabiliti senza verifica dei bilanci storici convalidati dal database.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Valutazione aziendale determinata dal server per stabilire prezzo e volume di azioni emettibili.
- **Gravità Imbroglio:** **ALTA**.

---

### 6. Meccaniche Territoriali, Consorzi e Shadow Ops

#### 6.1 Conquista Province (Guerra Territoriale)
- **Come si muove oggi:** `rpc_acquire_province(v_province_id, v_offer)` (`09_provinces_realestate_fuel.sql:53`).
- **Cosa controlla la RPC attuale:**
  - Lock su provincia, divieto auto-conquista, offerta minima +20% del valore attuale (`CEIL(current_value * 1.20)`), fondi compratore sufficienti, addebito compratore, accredito 80% al vecchio proprietario, passaggio di proprietà.
- **Cosa NON controlla:**
  - Nessun tetto massimo all'offerta (un account cheattato può offrire 10 miliardi bloccando per sempre la provincia agli altri).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Scaglioni massimi di offerta e validazione che la liquidità provenga da entrate tracciate a ledger.
- **Gravità Imbroglio:** **ALTA** (impatto competitivo multiplayer e griefing).

#### 6.2 Donazioni ad Alleanze, Consorzi e Holding
- **Come si muove oggi:** `rpc_donate_to_alliance` (`54_*`), `rpc_contribute_consorzio` (`15_*`), `rpc_contribute_holding_treasury` (`08_*`).
- **Cosa controllano le RPC attuali:**
  - Detraggono la cifra da `companies.cash` e la accreditano alla cassa dell'alleanza/holding.
- **Cosa NON controllano:**
  - Mancanza di rate-limit sul flusso di capitale trasferito.
- **Gravità Imbroglio:** **MEDIA**.

#### 6.3 Shadow Ops e Sabotaggi
- **Come si muove oggi:** `black_ops.js` &rarr; `rpc_execute_shadow_op`, `rpc_upgrade_shadow_defense` (`23_shadow_ops.sql`).
- **Cosa controllano le RPC attuali:**
  - Costo operazione e upgrade detratti lato server da `companies.cash`.
- **Cosa NON controllano:**
  - Prezzi delle operazioni determinati da formule SQL interne (corretto).
- **Gravità Imbroglio:** **BASSA**.

---

### 7. Valuta Premium (Driver Coins) & Token VTK

#### 7.1 Acquisto Driver Coins (DC)
- **Come si muove oggi:** `ServerState.addDriverCoins` &rarr; `rpc_add_driver_coins(p_amount, p_item_id)` (`41_*`, `43_ratelimit_driver_coins.sql`).
- **Cosa controlla la RPC attuale:**
  - Tetto massimo di 1.000.000 DC per singola chiamata (`41_*`).
  - Rate-limit di massimo 20 chiamate al minuto per utente (`43_*`).
  - Scrittura record di audit in `coin_transactions`.
- **Cosa NON controlla:**
  - **L'RPC È CONCESSA AL RUOLO `authenticated` SENZA ALCUNA VERIFICA DI PAGAMENTO REALE (Stripe/IAP)!**
  - Chiunque può invocare da console `ServerState.addDriverCoins(1000000)` e accreditarsi 1 milione di coin gratis a piacimento.
- **Cosa dovrebbe controllare una RPC sicura:**
  - **Revoca immediata del permesso `EXECUTE` al ruolo `authenticated`.**
  - L'accredito deve avvenire esclusivamente tramite Webhook Stripe autenticato con firma crittografica (`service_role` o Edge Function dedicata).
- **Gravità Imbroglio:** **MASSIMA ASSOLUTA (IMPATTO REALE / MONETARIO)**. I Driver Coins sono la valuta premium comprata con soldi veri.

#### 7.2 Spesa Driver Coins per Boost / Vantaggi
- **Come si muove oggi:** `CE_money.spendDC` &rarr; `ServerState.spendDriverCoins` &rarr; `rpc_ec_spend` (`05_*`, `17_*`).
- **Cosa controlla la RPC attuale:**
  - Fondi sufficienti `driver_coins >= p_amount`, detrazione e allineamento atomico.
- **Cosa NON controlla:**
  - I costi dei singoli articoli sono passati come parametro anziché mappati a catalogo fisso.
- **Gravità Imbroglio:** **ALTA**.

#### 7.3 Token VTK e Negozio VTK
- **Come si muove oggi:** `vtk-market.js` &rarr; `rpc_fill_vtk_order`, `rpc_spend_vtk_shop_item` (`21_vtk_token.sql`, `46_*`).
- **Cosa controllano le RPC attuali:**
  - Gestione balance VTK lato server; scambio atomico con DC/cassa.
- **Gravità Imbroglio:** **MEDIA**.

---

### 8. Azioni Varie e CEO

#### 8.1 Riposo CEO in Hotel
- **Come si muove oggi:** `ServerState.restCeo(hotelStars, cost)` &rarr; `rpc_rest_ceo(v_hotel_stars, v_cost)` (`02_mmo_rpcs_extension.sql:794`).
- **Cosa controlla la RPC attuale:**
  - `hotel_stars BETWEEN 1 AND 5`, `v_cost >= 0`, fondi sufficienti `cash >= v_cost`.
- **Cosa NON controlla:**
  - `v_cost` è passato dal client (`v_cost = 0` garantisce recupero energia gratis).
- **Cosa dovrebbe controllare:** Costo fisso per stella hotel calcolato lato server.
- **Gravità Imbroglio:** **BASSA**.

---

## Piano di Intervento Ordinato (Roadmap di Priorità)

Questa graduatoria stabilisce da dove conviene partire per blindare l'economia con il massimo rapporto tra sicurezza ottenuta e sforzo di sviluppo.

| Priorità | Area d'Intervento | Azioni Coinvolte | Motivo e Rischio Mitigato |
|---|---|---|---|
| **1 (Massima)** | **Driver Coins (Valuta Premium)** | `rpc_add_driver_coins` | **Impatto reale / economico.** Revocare l'accesso ad `authenticated` e collegare webhook Stripe. Impedisce la coniazione gratuita di valuta monetizzabile. |
| **2 (Critica)** | **Vendita Veicoli & Flotta** | `rpc_sell_vehicle`, `rpc_buy_vehicle` | **Fabbrica di soldi istantanea.** Oggi `rpc_sell_vehicle` accetta `v_price` arbitrario (permette di vendere un'utilitaria a 1 miliardo). Introdurre listino server e formula di deprezzamento. |
| **3 (Critica)** | **Core Loop Corse** | `rpc_start_trip`, `rpc_claim_trip_reward` | **Integrità del gameplay.** Il client non deve più passare `reward` e `duration`. La durata e il compenso devono essere calcolati dal server in base alla tratta e al tier del veicolo. |
| **4 (Critica)** | **Prestiti Bancari** | `rpc_take_loan` | **Iniezione incontrollata di liquidità.** Sostituire l'importo libero con scaglioni approvati dal server e calcolo automatico della rata. |
| **5 (Alta)** | **P2P & Mercato Azionario** | `rpc_list_car_for_sale`, `rpc_list_company_ipo`, `rpc_acquire_province` | **Antiriciclaggio e Anti-Griefing.** Introdurre tetti percentuali sui prezzi massimi di vendita P2P e sulle offerte delle province per evitare abusi multiplayer. |
| **6 (Alta)** | **Attivazione Ledger & Deprecazione syncCash** | `42_economy_ledger_scaffold.sql`, `rpc_sync_cash` | **Chiusura del minting da console.** Rimpiazzare `rpc_sync_cash` con `rpc_earn`/`rpc_spend` a delta certificati e abilitare il trigger di blocco su `companies.cash`. |
| **7 (Media)** | **Personale & Contratti B2B/Turismo** | `rpc_hire_driver`, `rpc_accept_b2b_contract` | **Validazione vincoli di gioco.** Stipendi minimi calcolati dal server e verifica dello stato reale dei veicoli vincolati. |
| **8 (Bassa)** | **Manutenzioni, Upgrades & Servizi** | `rpc_repair_vehicle`, `rpc_refuel_vehicle`, `rpc_buy_vehicle_upgrade`, `rpc_rest_ceo` | **Rifinitura costi vivi.** Formule server per usura, riparazioni e listini ricambi. |

---

## Riepilogo per Vlad

1. Il 90% delle vulnerabilità critiche attuali non deriva dalla mancanza di RPC, ma dal fatto che le RPC esistenti **accettano il prezzo/compenso come parametro fidandosi del client**.
2. Il passaggio a un'architettura 100% server-authoritative non richiede di riscrivere il gioco da zero, ma di **spostare i listini e le formule di calcolo dentro Postgres** (o tabelle di catalogo), trasformando i parametri delle RPC da `(prezzo)` a `(identificatore_oggetto)`.
3. Applicando le sole prime 4 priorità della tabella, oltre il 95% delle possibilità di exploit monetario viene neutralizzato.
