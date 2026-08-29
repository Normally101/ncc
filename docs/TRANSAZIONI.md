# Mappa delle Transazioni Economiche e Validazione Server

> **Scopo del documento**: Censimento completo e dettagliato di tutte le azioni di gioco che movimentano valuta (Cassa `EUR`, Driver Coins `DC`, Token `VTK`, Reputazione) in Chauffeur Empire.
> Questo documento fornisce l'analisi tecnica di fattibilità e impatto per la transizione dall'attuale modello *client-authoritative* (con sincronizzazione a specchio `rpc_sync_cash`) al modello *server-authoritative* (transazioni con validazione di regole di business, listini e proprietà lato PostgreSQL).
>
> **Aree coperte**: Tutte le 13 macro-aree economiche del gioco (Flotta e Officina, Corse e Dispatch, Staff, Mercato P2P e Aste, Valuta Premium DC e VTK, Contratti B2B e Turismo, Finanza e Prestiti, Consorzi e Sindacato, Infrastrutture e HQ, Black Ops e Nemesi, Marketing e Lobby, Ricompense giornaliere, Fallimento e Prestigio).

---

## 1. Come si muove il denaro oggi

Nel sistema attuale coesistono tre paradigmi di movimento economico:

1. **Client-Authoritative con `rpc_sync_cash` (Porta Unica `CE_money`)**:
   - Il browser calcola in locale il nuovo saldo (`gameState.cash ± delta`) tramite `CE_money.spend(importo)` o `CE_money.earn(importo)`.
   - `CE_money` invoca `ServerState.syncCash(gameState.cash)`, che esegue `rpc_sync_cash(v_cash)` (`10_sync_cash.sql`).
   - Il server accetta il numero assoluto inviato dal client ed esegue `UPDATE companies SET cash = v_cash`.
   - **Vantaggio**: Risolve la divergenza e impedisce acquisti fantasma al reload.
   - **Falla**: Chiunque apra gli strumenti di sviluppo (DevTools) o alteri la richiesta di rete può impostare `cash = 999.999.999€`.

2. **RPC Server-Side con `CE_money.addebitatoDalServer` / `accreditatoDalServer`**:
   - Alcuni moduli avanzati (es. Aste in `62_aste_ciclo_di_vita.sql`, Criptovalute, Donazioni Alleanza in `54_*`) eseguono la mutazione direttamente dentro la transazione SQL (`UPDATE companies SET cash = cash ± delta`).
   - Il client riceve la risposta della RPC e aggiorna la variabile locale senza reinviare `rpc_sync_cash`.
   - **Falla**: Anche se il server muove il saldo, spesso la RPC si fida di argomenti passati dal client (es. `v_cost`, `v_price`, `v_reward`) senza confrontarli con listini server.

3. **Valuta Premium (`Driver Coins`)**:
   - La spesa passa da `rpc_ec_spend` (`05_mmo_driver_coins.sql`) e l'accredito da `rpc_add_driver_coins` (`41_cap_driver_coins.sql`).
   - Il server controlla il saldo (`driver_coins >= p_amount`), ma `rpc_add_driver_coins` è esposta al ruolo `authenticated` senza prova d'acquisto crittografica (webhook Stripe).

---

## 2. Censimento Analitico delle Azioni Economiche

---

### Sezione 1: Flotta & Manutenzione

#### 1.1. Acquisto Veicolo da Salone (Showroom)
- **Come si muove oggi**: `ServerState.buyVehicle(modelId, price, hqCity)` chiama `rpc_buy_vehicle` (`01_mmo_migration.sql:184`).
- **Cosa controlla lato server**:
  - Utente autenticato (`auth.uid()`).
  - Row lock su `companies` (`FOR UPDATE`).
  - `v_price >= 0` e `v_company.cash >= v_price`.
- **Cosa NON controlla**:
  - Non verifica `v_price` contro il listino ufficiale delle auto (`CAR_CATALOG` in `data.js` / DB).
  - Un client manipolato può passare `v_price = 1` e comprare una Hypercar da 500.000€ pagando 1€.
- **Cosa dovrebbe controllare una RPC sicura**:
  - La RPC deve accettare solo `v_model_id`.
  - Il prezzo deve essere letto dalla tabella `car_catalog` su DB.
  - Generazione targa e inserimento in `vehicles` con stato `IDLE`.
- **Gravità imbroglio**: **Alta**. Consente di ottenere flotte enormi a costo nullo, sbilanciando la classifica e la capacità produttiva.

#### 1.2. Vendita Veicolo Usato al Salone
- **Come si muove oggi**: `ServerState.sellVehicle(vehicleId, price)` chiama `rpc_sell_vehicle` (`02_mmo_rpcs_extension.sql`).
- **Cosa controlla lato server**: Proprietà del veicolo (`company_id`), stato `IDLE`.
- **Cosa NON controlla**: Il prezzo di vendita `v_price` è passato dal client. Un utente può vendere un'utilitaria usata per 100.000.000€.
- **Cosa dovrebbe controllare una RPC sicura**: Calcolo del valore residuo server-side basato sul prezzo di listino, usura (`condition`), chilometraggio ed età del veicolo.
- **Gravità imbroglio**: **Alta**. Generatore istantaneo di liquidità illimitata.

#### 1.3. Noleggio / Leasing Veicolo
- **Come si muove oggi**: Gestito lato client via `CE_money.spend(anticipo)` + canone giornaliero scalato nel daily tick.
- **Cosa controlla lato server**: Nessuna RPC dedicata per la stipula leasing (si appoggia a `rpc_sync_cash`).
- **Cosa dovrebbe controllare una RPC sicura**:
  - `rpc_lease_vehicle(v_model_id, v_term_days)`.
  - Verifica solvibilità, creazione contratto leasing in tabella dedicata, addebito anticipo server-side.
- **Gravità imbroglio**: **Media**.

#### 1.4. Riparazione Ordinaria Veicolo
- **Come si muove oggi**: `ServerState.repairVehicle(vehicleId, cost)` chiama `rpc_repair_vehicle` (`02_mmo_rpcs_extension.sql:732`).
- **Cosa controlla lato server**:
  - Proprietà del veicolo (`company_id = v_company.id`).
  - Stato veicolo: deve essere `IDLE` o `MAINTENANCE`.
  - Fondi sufficienti: `v_company.cash >= v_cost`.
  - `v_cost >= 0`.
- **Cosa NON controlla**:
  - Non calcola la tariffa di riparazione in base ai danni effettivi (`100 - condition`).
  - Il client può passare `v_cost = 0` e ripristinare `condition = 100` e `tire_pressure = 100` gratis.
- **Cosa dovrebbe controllare una RPC sicura**:
  - `rpc_repair_vehicle(v_vehicle_id)` (senza parametro costo).
  - Costo calcolato sul server: `(100 - condition) * tariffa_oraria_modello`.
- **Gravità imbroglio**: **Media**. Annulla i costi operativi di gestione flotta.

#### 1.5. Riparazione Istantanea Flotta con Driver Coins
- **Come si muove oggi**: `ServerState.buyFleetRepair(costInCoins)` chiama `rpc_buy_fleet_repair` (`05_mmo_driver_coins.sql`).
- **Cosa controlla lato server**: `driver_coins >= p_cost_in_coins`. Ripristina lo stato di tutti i veicoli.
- **Cosa NON controlla**: Verifica che il costo in coin corrisponda al tariffario del negozio.
- **Cosa dovrebbe controllare una RPC sicura**: Costo fisso definito sul server (es. 25 DC), verifica saldo DC, aggiornamento atomico di tutti i veicoli della compagnia.
- **Gravità imbroglio**: **Critica**. Riguarda la valuta premium e le entrate del gioco.

#### 1.6. Upgrade e Personalizzazione Veicolo
- **Come si muove oggi**: `ServerState.buyVehicleUpgrade(vehicleId, upgradeId, price)` chiama `rpc_buy_vehicle_upgrade` (`02_mmo_rpcs_extension.sql:274`).
- **Cosa controlla lato server**:
  - Proprietà veicolo, stato `IDLE`.
  - Controlla che l'upgrade non sia già presente (`v_upgrade_id = ANY(v_vehicle.upgrades)`).
  - Fondi: `v_company.cash >= v_price`.
- **Cosa NON controlla**: Il prezzo `v_price` è stabilito dal client.
- **Cosa dovrebbe controllare una RPC sicura**: Tabella `vehicle_upgrades_catalog` con prezzi autoritativi per ciascun `upgrade_id`.
- **Gravità imbroglio**: **Media**.

#### 1.7. Rifornimento Carburante e Pressione Gomme
- **Come si muove oggi**: `ServerState.refuelVehicle(vehicleId, fuelAmount, cost)` chiama `rpc_refuel_vehicle` (`02_mmo_rpcs_extension.sql:668`).
- **Cosa controlla lato server**: Proprietà veicolo, `cash >= v_cost`.
- **Cosa NON controlla**: Non valida il prezzo del carburante rispetto a `fuel_market.price_eur` né la capienza del serbatoio.
- **Cosa dovrebbe controllare una RPC sicura**:
  - Lettura del prezzo al litro corrente da `fuel_market`.
  - Calcolo litri necessari: `tank_capacity - current_fuel`.
  - Addebito del prezzo esatto `litri * price_eur`.
- **Gravità imbroglio**: **Bassa / Media**.

#### 1.8. Telepass Flotta
- **Come si muove oggi**: `ServerState.toggleTelepass(vehicleId, cost)` chiama `rpc_toggle_telepass` (`02_mmo_rpcs_extension.sql:346`).
- **Cosa controlla lato server**: Proprietà veicolo, `cash >= v_cost`.
- **Cosa NON controlla**: Il costo di attivazione (500€) è passato dal client.
- **Cosa dovrebbe controllare una RPC sicura**: Costo standard server (500€ se attivato, 0€ se disattivato).
- **Gravità imbroglio**: **Bassa**.

---

### Sezione 2: Corse, Dispatch & Eventi Stradali

#### 2.1. Inizio e Completamento Corsa (Core Loop)
- **Come si muove oggi**:
  - Inizio: `ServerState.startTrip(vId, dId, endCity, reward, duration, isEmpty)` chiama `rpc_start_trip` (`01_mmo_migration.sql`).
  - Completamento: `ServerState.claimReward(tripId)` chiama `rpc_claim_trip_reward` (`01_mmo_migration.sql`).
- **Cosa controlla lato server**:
  - `rpc_start_trip`: disponibilità veicolo e autista (`IDLE`), calcola `end_time = now() + (duration_ms || ' milliseconds')::interval`.
  - `rpc_claim_trip_reward`: controlla che `now() >= end_time` e che il viaggio non sia già stato riscosso (`claimed = true`). Accredita `reward_cash` su `companies.cash`.
- **Cosa NON controlla**:
  - `rpc_start_trip` accetta `v_reward` e `v_duration_ms` passati dal client!
  - Un client manipolato può avviare una corsa con `v_duration_ms = 1` e `v_reward = 1.000.000€` e riscuoterla un millisecondo dopo.
- **Cosa dovrebbe controllare una RPC sicura**:
  - Matrice distanze/tempi server-side tra città di partenza e arrivo (`routes` DB).
  - Formula tariffaria protetta: `tariffa_base + km * tariffa_km * moltiplicatori_classe`.
  - Tempo minimo non negoziabile dal client.
- **Gravità imbroglio**: **Alta / Massima**. È il cuore del gameplay: falsificare reward e tempi distrugge la progressione in pochi secondi.

#### 2.2. Corse VIP e Missioni Speciali
- **Come si muove oggi**: Calcolate in `vip-clients.js` e `contracts.js` con accredito tramite `CE_money.earn(ricompensa)` seguito da `syncCash`.
- **Cosa controlla lato server**: Nessun controllo, puro client-authoritative.
- **Cosa dovrebbe controllare una RPC sicura**:
  - Registrazione del contratto VIP con seed/ID univoco sul server.
  - Verifica requisiti autista/veicolo al momento dell'assegnazione e completamento.
- **Gravità imbroglio**: **Alta**.

#### 2.3. Corse a Vuoto / Riposizionamento Veicoli
- **Come si muove oggi**: `dispatchEmptyLeg` in `engine-rides.js` scala costo carburante via `CE_money.spend`.
- **Cosa controlla lato server**: Solo `rpc_sync_cash`.
- **Cosa dovrebbe controllare una RPC sicura**: `rpc_start_trip` con flag `is_empty_return = true`, costo carburante addebitato lato server in base alla distanza.
- **Gravità imbroglio**: **Bassa**.

#### 2.4. Pagamento Multe Stradali
- **Come si muove oggi**: `payFine` in `engine-events.js` scala il costo con `CE_money.spend(multa)`.
- **Cosa controlla lato server**: Solo `rpc_sync_cash`.
- **Cosa dovrebbe controllare una RPC sicura**: Generazione evento infrazione registrata in DB con timer di scadenza e maggiorazione di mora.
- **Gravità imbroglio**: **Bassa**.

---

### Sezione 3: Autisti & Gestione Personale

#### 3.1. Assunzione Autista
- **Come si muove oggi**: `ServerState.hireDriver(name, salary, tier)` chiama `rpc_hire_driver` (`02_mmo_rpcs_extension.sql:115`).
- **Cosa controlla lato server**:
  - `v_salary >= 0`, `v_tier IN ('STANDARD', 'PREMIUM', 'VIP', 'ELITE')`.
  - Addebita `bonus di assunzione = v_salary * 2`.
  - Verifica `v_company.cash >= v_salary * 2`.
- **Cosa NON controlla**: Il client passa `v_salary`. Un utente può assumere un autista `ELITE` dichiarando stipendio 0€ e assumerlo gratis senza costi futuri.
- **Cosa dovrebbe controllare una RPC sicura**: Tabella parametri stipendi per tier (es. ELITE: min 3.500€/mese) o generazione del candidato nel pool server.
- **Gravità imbroglio**: **Alta**. Stipendi a 0 azzerano i costi fissi per sempre.

#### 3.2. Licenziamento / TFR Autista
- **Come si muove oggi**: `ServerState.fireDriver(driverId)` chiama `rpc_fire_driver` (`02_mmo_rpcs_extension.sql:171`).
- **Cosa controlla lato server**: Verifica che l'autista appartenga all'azienda e non sia in viaggio (`status <> 'DRIVING'`).
- **Cosa NON controlla**: Non applica penali/TFR server-side (gestite solo in locale con `CE_money.spend`).
- **Cosa dovrebbe controllare una RPC sicura**: Calcolo TFR server-side proporzionale all'anzianità di servizio e addebito automatico.
- **Gravità imbroglio**: **Bassa / Media**.

#### 3.3. Riposo CEO e Recupero Stress Autisti
- **Come si muove oggi**: `ServerState.restCeo(hotelStars, cost)` chiama `rpc_rest_ceo` (`02_mmo_rpcs_extension.sql:798`).
- **Cosa controlla lato server**: `v_hotel_stars BETWEEN 1 AND 5`, `cash >= v_cost`.
- **Cosa NON controlla**: Il costo dell'hotel `v_cost` è fornito dal client (un hotel 5 stelle può costare 0€).
- **Cosa dovrebbe controllare una RPC sicura**: Tabella prezzi hotel lato server (1 stella: 50€, ..., 5 stelle: 1.000€).
- **Gravità imbroglio**: **Bassa**.

#### 3.4. Guarigione Istantanea Autisti con DC
- **Come si muove oggi**: `healAllDriversDC` chiama `CE_money.spendDC(15, 'heal_drivers')`.
- **Cosa controlla lato server**: `rpc_ec_spend` controlla saldo DC.
- **Cosa NON controlla**: Il ripristino di energia/salute degli autisti avviene per mutazione diretta in `gameState.drivers` del client.
- **Cosa dovrebbe controllare una RPC sicura**: `rpc_heal_all_drivers` che scala atomicamente i DC e aggiorna la tabella `drivers` nel DB.
- **Gravità imbroglio**: **Media**.

#### 3.5. Assunzione Crumiri (Anti-Sciopero)
- **Come si muove oggi**: `hireCrumiri` chiama `rpc_hire_crumiri` (`15_sindacato_mechanics.sql:294`).
- **Cosa controlla lato server**: Verifica appartenenza azienda e stato di sciopero attivo.
- **Cosa NON controlla**: Costo fissato o scalato via `CE_money`.
- **Cosa dovrebbe controllare una RPC sicura**: Addebito server-side del costo dei crumiri direttamente su `companies.cash`.
- **Gravità imbroglio**: **Media**.

---

### Sezione 4: Mercato P2P & Aste Giudiziarie (Multiplayer)

#### 4.1. Vendita Veicolo sul Mercato P2P
- **Come si muove oggi**: `listCarForSale` chiama `rpc_list_car_for_sale` (`08_mmo_p2p_marketplace.sql:93`).
- **Cosa controlla lato server**:
  - Proprietà del veicolo, stato non impegnato in corse.
  - Inserisce l'annuncio nella tabella `p2p_market_listings`.
- **Cosa NON controlla**: Nessun controllo sul prezzo minimo/massimo (rischio di mercato nero per trasferire denaro tra account con auto spazzatura a milioni).
- **Cosa dovrebbe controllare una RPC sicura**: Range di prezzo accettabile basato sul fair value del veicolo (es. ±50% del listino).
- **Gravità imbroglio**: **Critica**. Rischio riciclaggio e trasferimento fondi illeciti tra account.

#### 4.2. Acquisto Veicolo sul Mercato P2P
- **Come si muove oggi**: `buyP2PCar` chiama `rpc_buy_market_car` (`52_fix_p2p_sindacato_cash_source_of_truth.sql:95`).
- **Cosa controlla lato server**:
  - Row lock su acquirente e venditore (`FOR UPDATE`).
  - Verifica disponibilità fondi dell'acquirente (`cash >= listing.price`).
  - Trasferisce la proprietà del veicolo nella tabella `vehicles`.
  - Esegue `cash = cash - price` su acquirente e `cash = cash + price` su venditore nella stessa transazione.
- **Cosa NON controlla**: È una delle RPC più solide del codebase (dopo i fix di sicurezza della patch 52).
- **Cosa dovrebbe migliorare**: Tassa/commissione di mercato (es. 5%) trattenuta per drenare liquidità dal server.
- **Gravità imbroglio**: **Critica** (multiplayer trade).

#### 4.3. Offerte su Aste Giudiziarie
- **Come si muove oggi**: `auctionsPlaceBid` chiama `rpc_place_auction_bid` (`62_aste_ciclo_di_vita.sql:186`).
- **Cosa controlla lato server**:
  - Asta attiva e non scaduta.
  - Offerta superiore all'offerta corrente (`v_bid_amount >= current_bid + min_increment`).
  - Verifica solvibilità dell'offerente (`cash >= v_bid_amount`).
- **Cosa NON controlla**: L'importo non viene bloccato in un deposito vincolato (*escrow*) al momento dell'offerta, ma scalato solo alla riscossione.
- **Cosa dovrebbe controllare una RPC sicura**: Blocco cauzione immediata (*escrow lock*) per evitare offerte civetta senza fondi al momento della chiusura.
- **Gravità imbroglio**: **Alta** (PvP/Multiplayer economy).

#### 4.4. Riscossione Lotto Vinto all'Asta
- **Come si muove oggi**: `auctionsClaim` chiama `rpc_claim_auction` (`62_aste_ciclo_di_vita.sql:64`).
- **Cosa controlla lato server**:
  - Utente è il vincitore effettivo del lotto.
  - Addebita il prezzo offerto su `companies.cash`.
  - Se il lotto è un veicolo, lo trasferisce nella flotta dell'utente. Se è un container con contanti, accredita il contenuto con `_add_player_cash`.
  - Client allinea lo stato con `CE_money.accreditatoDalServer` / `addebitatoDalServer`.
- **Cosa NON controlla**: Ben protetta sul server.
- **Gravità imbroglio**: **Alta**.

---

### Sezione 5: Valuta Premium (Driver Coins) & Token VTK

#### 5.1. Acquisto Driver Coins con Denaro Reale (Stripe)
- **Come si muove oggi** (dal 29/08/2026, `68_pagamenti_driver_coins.sql`): il browser NON accredita e NON puo' accreditare. Il percorso e' in quattro passi, e solo il terzo tocca il saldo:
  1. `_dcAcquistaPacchetto(packKey)` (`ui-store.js`) manda a `POST /api/dc-checkout` **solo la chiave del pacchetto**, con il JWT Supabase del giocatore;
  2. `api/dc-checkout.mjs` verifica il token presso Supabase, legge prezzo e quantita' di coin dalla tabella `dc_packs` — mai dal browser — e apre una Stripe Checkout Session con `metadata.user_id` e `metadata.pack_key`;
  3. a pagamento avvenuto Stripe chiama `api/dc-webhook.mjs`, che **verifica la firma HMAC** e solo allora invoca `rpc_credit_dc_purchase(...)` con la chiave `service_role`;
  4. il giocatore torna su `/?dc=ok`, e `_dcRitornoDallaCassa()` richiede il saldo al server (`ServerState.getDriverCoins`) e lo allinea con `CE_money.dcAccreditatiDalServer`.
- **Perche' e' scritto cosi'**: `?dc=ok` non e' una prova di pagamento — chiunque puo' digitarlo nella barra degli indirizzi. Serve solo a sapere che vale la pena richiedere il saldo, e il saldo lo decide la riga `companies` sul server.
- **Cosa controlla lato server**:
  - `rpc_credit_dc_purchase` e' **revocata ad `anon` e `authenticated`**: eseguibile solo da `service_role`, che il browser non possiede. E' questa revoca, non un controllo nel codice, a rendere impossibile l'accredito dal client.
  - Idempotenza su `dc_purchases.stripe_event_id UNIQUE`: Stripe riconsegna lo stesso evento se la risposta tarda, e due consegne possono arrivare in parallelo su istanze diverse — dove un controllo applicativo non le vedrebbe entrambe.
  - L'importo pagato deve coincidere con `dc_packs.price_cents`, altrimenti nessun accredito e un WARNING nei log.
  - Il catalogo `dc_packs` ha RLS in sola lettura: i prezzi si cambiano solo da una migrazione.
- **Storia**: `65_executive_pack_server_purchase.sql` prevedeva `ec_dc_packs`/`ec_pack_payments` e `rpc_purchase_dc_pack`. **Non e' mai stato applicato**: verificato sul database il 29/08/2026, quelle tabelle non esistono. Il client chiamava una RPC inesistente e l'acquisto falliva sempre. Nessun coin regalato, ma nemmeno nessun acquisto possibile.
- **Cosa NON controlla**:
  - L'integrazione col vero PSP (firma HMAC webhook Stripe) non c'è ancora: finché manca, nessuna riga di pagamento può esistere e lo store rifiuta ogni acquisto invece di regalare DC.
  - `rpc_add_driver_coins` resta usata dai premi di gioco (quest/daily): è invocabibile da `authenticated` con il cap di `41_cap_driver_coins.sql` e il rate limit di `43_ratelimit_driver_coins.sql`.
- **Gravità imbroglio residua**: **Alta** (per via di `rpc_add_driver_coins` sui premi); per l'acquisto pacchetti il bypass client-side è chiuso.

#### 5.2. Spesa Driver Coins per Booster, Automazione e Riparazioni
- **Come si muove oggi**: `ServerState.spendDriverCoins` / `CE_money.spendDC` chiama `rpc_ec_spend(p_item_id, p_amount)` (`05_mmo_driver_coins.sql`).
- **Cosa controlla lato server**: `p_amount > 0`, `driver_coins >= p_amount`. Sottrae `driver_coins` e restituisce il nuovo saldo.
- **Cosa NON controlla**: Si fida del parametro `p_amount` fornito dal client (un booster da 100 DC può essere comprato passando `p_amount = 1`).
- **Cosa dovrebbe controllare una RPC sicura**: Catalogo server con mappatura fissa `item_id -> costo_dc`. La RPC deve ricevere solo `p_item_id`.
- **Gravità imbroglio**: **Critica**.

#### 5.3. Ordini di Vendita e Acquisto Token VTK
- **Come si muove oggi**:
  - Vendita: `rpc_place_vtk_sell_order` (`21_vtk_token.sql:86`) blocca i VTK sul saldo aziendale.
  - Esecuzione: `rpc_fill_vtk_order` (`21_vtk_token.sql:110`) deduce `cost = amount * price` in DC dall'acquirente e trasferisce VTK e DC.
- **Cosa controlla lato server**: Row lock, verifica che l'ordine sia aperto (`status = 'OPEN'`), verifica saldo DC dell'acquirente, trasferimento atomico.
- **Cosa NON controlla**: Tetto anti-speculazione sulla volatilità del prezzo unitario inserito nell'ordine di vendita.
- **Cosa dovrebbe controllare una RPC sicura**: Circuito di salvaguardia sui prezzi minimi/massimi consentiti per token VTK.
- **Gravità imbroglio**: **Critica** (valuta premium incrociata).

#### 5.4. Acquisti Shop VTK e Cosmetici Vanity
- **Come si muove oggi**: `rpc_spend_vtk_shop_item` (`46_vtk_shop_purchase_scaffold.sql`) per shop VTK; `vanity.js` per livree e titoli con `_dcSpend`.
- **Cosa controlla lato server**: Saldo VTK per gli item shop censiti.
- **Cosa NON controlla**: I prezzi dei cosmetici in `vanity.js` non hanno RPC dedicate (passano per il generico `rpc_ec_spend`).
- **Cosa dovrebbe controllare una RPC sicura**: Tabella `vanity_catalog` con id, costo e applicazione immediata sul profilo.
- **Gravità imbroglio**: **Media**.

---

### Sezione 6: Contratti B2B & Turismo

#### 6.1. Tick Giornaliero Contratti B2B
- **Come si muove oggi**: `_b2bDailyTick` chiama `rpc_b2b_daily_tick` (`19_b2b_contracts.sql:168`).
- **Cosa controlla lato server**:
  - Cerca contratti attivi dell'azienda.
  - Calcola giorni rimanenti (`days_remaining = days_remaining - 1`).
  - Accredita `payout` giornaliero su `companies.cash`.
  - Client aggiorna il saldo con `CE_money.accreditatoDalServer`.
- **Cosa NON controlla**: Non verifica se i requisiti di flotta/SLA minimi sono stati effettivamente rispettati durante la giornata dal giocatore.
- **Cosa dovrebbe controllare una RPC sicura**: Verifica stato flotta assegnata e chilometri minimi registrati nel giorno.
- **Gravità imbroglio**: **Alta**.

#### 6.2. Risoluzione Anticipata / Penale Contratto B2B
- **Come si muove oggi**: `b2bTerminateContract` chiama `rpc_terminate_b2b_contract` (`19_b2b_contracts.sql:223`).
- **Cosa controlla lato server**:
  - Trova il contratto attivo.
  - Calcola la penale di recesso (`v_penalty = total_value * 0.20`).
  - Scala la penale con `UPDATE companies SET cash = cash - v_penalty`.
- **Cosa NON controlla**: Ben protetta lato server.
- **Gravità imbroglio**: **Media**.

#### 6.3. Bandi Turismo (Gare d'Appalto)
- **Come si muove oggi**:
  - Offerta: `rpc_submit_tourism_bid` (`33_tourism_tenders.sql:403`).
  - Tick: `rpc_tourism_daily_tick` (`33_tourism_tenders.sql:494`).
  - Risoluzione: `rpc_terminate_tourism_contract` (`33_tourism_tenders.sql:556`).
- **Cosa controlla lato server**: Bando attivo, reputazione minima, flotta idonea, accredito/addebito gestiti interamente via SQL.
- **Cosa NON controlla**: I requisiti di punteggio e allocazione flotta sono calcolati in parte dal client prima di inviare l'offerta.
- **Cosa dovrebbe controllare una RPC sicura**: Validazione autoritativa dell'idoneità della flotta su DB prima di registrare l'offerta.
- **Gravità imbroglio**: **Alta**.

---

### Sezione 7: Finanza, Prestiti, Cripto & Borsa

#### 7.1. Accensione Prestito Bancario
- **Come si muove oggi**: `ServerState.takeLoan(principal, interestRate, dailyPayment)` chiama `rpc_take_loan` (`02_mmo_rpcs_extension.sql:482`).
- **Cosa controlla lato server**:
  - Max 3 prestiti attivi contemporaneamente.
  - `v_principal > 0`, `v_daily_payment > 0`.
  - Accredita `v_principal` su `companies.cash`.
- **Cosa NON controlla**:
  - `v_principal`, `v_interest_rate` e `v_daily_payment` sono passati come parametri dal client!
  - Un utente può chiedere un prestito con `v_principal = 10.000.000€` e `v_daily_payment = 1€` con tasso 0%.
- **Cosa dovrebbe controllare una RPC sicura**:
  - Piani di prestito prefissati sul server (es. Micro-credito 10k, Espansione 50k, Corporate 250k).
  - Formula di calcolo rate e interessi calcolata interamente in SQL.
  - Credit score basato sul patrimonio netto dell'azienda.
- **Gravità imbroglio**: **Alta**. Crea liquidità dal nulla senza costi di rimborso.

#### 7.2. Rimborso Prestito Bancario
- **Come si muove oggi**: `ServerState.repayLoan(loanId, amount)` chiama `rpc_repay_loan` (`02_mmo_rpcs_extension.sql:544`).
- **Cosa controlla lato server**: Proprietà del prestito, `cash >= v_amount`, aggiorna debito residuo o elimina prestito se saldato.
- **Cosa NON controlla**: Rimborso corretto.
- **Gravità imbroglio**: **Media**.

#### 7.3. Compravendita Criptovalute (Market Trading)
- **Come si muove oggi**:
  - Acquisto: `cryptoBuy` chiama `rpc_crypto_buy` (`24_crypto_offshore.sql`).
  - Vendita: `cryptoSell` chiama `rpc_crypto_sell` (`24_crypto_offshore.sql`).
- **Cosa controlla lato server**:
  - Row lock su `companies`.
  - Verifica fondi cassa / disponibilità saldo criptovaluta.
  - Esegue la mutazione atomica su `companies.cash` e sul portafoglio crypto.
  - Client aggiorna con `CE_money.addebitatoDalServer` / `accreditatoDalServer`.
- **Cosa NON controlla**: Prezzo delle crypto calcolato su andamento volatile client se non sincronizzato da oracle server.
- **Cosa dovrebbe controllare una RPC sicura**: Tabella oracolo prezzi `crypto_market_prices` aggiornata dal server con cron-job.
- **Gravità imbroglio**: **Alta**.

#### 7.4. Quotazione in Borsa (IPO) e Compravendita Azioni
- **Come si muove oggi**:
  - IPO: `listCompanyIPO` chiama `rpc_list_company_ipo` (`08_mmo_p2p_marketplace.sql:498`).
  - Buy/Sell shares: `rpc_buy_company_shares` (`52_fix_p2p_sindacato_cash_source_of_truth.sql:169`) e `rpc_sell_company_shares`.
- **Cosa controlla lato server**:
  - Requisito reputazione minima (patch 57), quota azionaria disponibile.
  - Movimentazione atomica di denaro tra acquirente e società target.
- **Cosa NON controlla**: Pompaggio artificiale della valutazione aziendale (*pump and dump*) tramite compravendita tra account secondari.
- **Cosa dovrebbe controllare una RPC sicura**: Circuit breaker su variazioni di prezzo giornaliere superiori al ±20%.
- **Gravità imbroglio**: **Critica** (mercato azionario MMO).

#### 7.5. OPA Ostile e Buyback Azionario
- **Come si muove oggi**: `_opaRequestBuyback` chiama `rpc_opa_buyback` (`27_hostile_takeovers.sql:161`).
- **Cosa controlla lato server**: Verifica che l'OPA sia attiva, controlla fondi del difensore, deduce il prezzo di riacquisto e ripristina la proprietà delle azioni.
- **Cosa NON controlla**: Ben strutturata sul server.
- **Gravità imbroglio**: **Alta**.

#### 7.6. Investimenti Finanziari Passivi
- **Come si muove oggi**: `ServerState.buyInvestment(invId, price)` chiama `rpc_buy_investment` (`02_mmo_rpcs_extension.sql:218`).
- **Cosa controlla lato server**: Proprietà, vincolo di unicità investimento per azienda (`UNIQUE`), `cash >= v_price`.
- **Cosa NON controlla**: Prezzo `v_price` passato dal client (può comprare un fondo immobiliare da 100k a 1€).
- **Cosa dovrebbe controllare una RPC sicura**: Tabella catalogo investimenti con costi e rendimenti orari/giornalieri autoritativi.
- **Gravità imbroglio**: **Media / Alta**.

---

### Sezione 8: Consorzi, Alleanze & Sindacato

#### 8.1. Creazione Consorzio / Alleanza
- **Come si muove oggi**: `_alCreate` scala 25.000€ via `CE_money.spend` e invoca `rpc_create_alliance` (`alliances.js:288`).
- **Cosa controlla lato server**: Lunghezza nome/tag, unicità nome alleanza.
- **Cosa NON controlla**: Il costo di creazione (25.000€) è gestito solo dal client con `CE_money.spend` e `syncCash`.
- **Cosa dovrebbe controllare una RPC sicura**:
  - La RPC deve verificare `v_company.cash >= 25000` e scalare la cassa direttamente sul server durante la creazione.
- **Gravità imbroglio**: **Media**.

#### 8.2. Donazione alla Tesoreria del Consorzio
- **Come si muove oggi**: `_alDonate` chiama `rpc_donate_to_alliance(p_amount)` (`54_fix_donate_to_alliance_cash_source_of_truth.sql:36`).
- **Cosa controlla lato server**:
  - `p_amount > 0`, `companies.cash >= p_amount`.
  - Esegue `UPDATE companies SET cash = cash - p_amount` e `UPDATE alliances SET treasury = treasury + p_amount`.
  - Client usa `CE_money.addebitatoDalServer`.
- **Cosa NON controlla**: Ben protetta sul server.
- **Gravità imbroglio**: **Alta** (trasferimento fondi a strutture condivise).

#### 8.3. Pizzo e Tangenti a Don Carmine
- **Come si muove oggi**: `payDonCarmine` chiama `rpc_pay_don_carmine` (`15_sindacato_mechanics.sql:322`).
- **Cosa controlla lato server**: Scala la cassa del giocatore e azzera la pressione sindacale.
- **Cosa NON controlla**: L'importo del pizzo deve essere calcolato dal server in percentuale sul fatturato settimanale.
- **Cosa dovrebbe controllare una RPC sicura**: Formula autoritativa: `pizzo = GREATEST(1000, weekly_revenue * 0.05)`.
- **Gravità imbroglio**: **Media**.

---

### Sezione 9: Infrastruttura, HQ & Immobili

#### 9.1. Acquisto Deposito Carburante
- **Come si muove oggi**: `_infraBuyDepot` chiama `rpc_buy_fuel_depot` (`30_sql_patch.sql:55`).
- **Cosa controlla lato server**:
  - Costo fisso server `v_cost = 50000`.
  - `companies.cash >= v_cost`.
  - Deduce `cash = cash - v_cost` e assegna il deposito in `fuel_depots`.
  - Client aggiorna con `CE_money.addebitatoDalServer`.
- **Cosa NON controlla**: Ben protetta sul server.
- **Gravità imbroglio**: **Media**.

#### 9.2. Upgrade Stanze HQ (Sede Aziendale)
- **Come si muove oggi**: `hqUpgradeRoom` in `hq.js` scala il costo con `CE_money.spend(costo)` e chiama `syncCash`.
- **Cosa controlla lato server**: Nessuna RPC dedicata (tutto in `gameState.hq` sincronizzato nel JSON di salvataggio).
- **Cosa dovrebbe controllare una RPC sicura**: `rpc_upgrade_hq_room(v_room_id)` con requisiti di livello e costo in tabella SQL.
- **Gravità imbroglio**: **Media**.

#### 9.3. Acquisto Immobili & Hub Regionali (Real Estate)
- **Come si muove oggi**: `ServerState.buyRealEstate(listingId)` chiama `rpc_buy_real_estate` (`09_provinces_realestate_fuel.sql`).
- **Cosa controlla lato server**:
  - Immobile disponibile, unicità possesso.
  - Deduce il prezzo autoritativo registrato nel DB `real_estate_listings.price`.
  - Assegna l'immobile alla compagnia.
- **Cosa NON controlla**: Ben protetta sul server.
- **Gravità imbroglio**: **Alta**.

#### 9.4. Conquista Territoriale / War Room (Province)
- **Come si muove oggi**: `ServerState.acquireProvince(provinceId, offer)` chiama `rpc_acquire_province` (`09_provinces_realestate_fuel.sql`).
- **Cosa controlla lato server**: Verifica che l'offerta superi il prezzo base della provincia, controlla fondi e deduce la cifra.
- **Cosa NON controlla**: Si fida di `v_offer` se superiore al minimo, ma non limita la frequenza delle offerte consecutive.
- **Cosa dovrebbe controllare una RPC sicura**: Rate limit e cooldown di conquista per provincia.
- **Gravità imbroglio**: **Alta** (influenza sul controllo della mappa MMO).

#### 9.5. Lifestyle Assets (Beni di Lusso)
- **Come si muove oggi**: `buyLifestyleAsset` in `ui-lifestyle.js` scala con `CE_money.spend(costo)` e assegna bonus prestigio/reputazione.
- **Cosa controlla lato server**: Solo `rpc_sync_cash`.
- **Cosa dovrebbe controllare una RPC sicura**: Catalogo server con id, costo e cap ai moltiplicatori di prestigio.
- **Gravità imbroglio**: **Bassa / Media**.

---

### Sezione 10: Black Ops & Nemesi

#### 10.1. Esecuzione Operazioni Ombra (Sabotaggi / Spionaggio)
- **Come si muove oggi**: `shadowExecuteOp` chiama `rpc_execute_shadow_op` (`23_shadow_ops.sql:52`).
- **Cosa controlla lato server**:
  - Cooldown dell'operazione.
  - Verifica costo server `v_op_cost` e fondi sufficienti (`cash >= v_op_cost`).
  - Deduce il costo e calcola l'esito probabilistico server-side basandosi sulle difese del bersaglio.
- **Cosa NON controlla**: Ben protetta sul server.
- **Gravità imbroglio**: **Alta** (PvP offensivo).

#### 10.2. Upgrade Difese Black Ops
- **Come si muove oggi**: `shadowUpgradeDefense` chiama `rpc_upgrade_shadow_defense(v_cost)` (`23_shadow_ops.sql:237`).
- **Cosa controlla lato server**: `cash >= v_cost`, incrementa il livello di difesa.
- **Cosa NON controlla**: Il costo `v_cost` è passato dal client (può passare 1€ per il livello massimo di difesa).
- **Cosa dovrebbe controllare una RPC sicura**: Costo progressivo calcolato su DB: `livello_attuale * 15000€`.
- **Gravità imbroglio**: **Media**.

#### 10.3. Corruzione VIP e Finanziamento Rivali (Nemesi)
- **Come si muove oggi**:
  - `_nemesisFundRival` chiama `rpc_nemesis_fund_rival` (`28_nemesis_vip.sql:9`).
  - `_nemesisBribeVip` in `nemesis.js` usa `CE_money.spend`.
- **Cosa controlla lato server**: `rpc_nemesis_fund_rival` è stata revocata/ristretta per prevenire exploit (patch 53).
- **Cosa dovrebbe controllare una RPC sicura**: Controllo atomico e tracciamento nel log nemesi.
- **Gravità imbroglio**: **Media**.

---

### Sezione 11: Marketing, Lobby & Politica

#### 11.1. Campagne di Marketing
- **Come si muove oggi**: `ServerState.startCampaign(campaignId, dailyCost)` chiama `rpc_start_marketing_campaign` (`02_mmo_rpcs_extension.sql:409`).
- **Cosa controlla lato server**: Salva la campagna attiva con `daily_cost`. I costi vengono dedotti da `rpc_collect_daily_costs`.
- **Cosa NON controlla**: `dailyCost` passato dal client (campagna globale a 0€/giorno).
- **Cosa dovrebbe controllare una RPC sicura**: Listino campagne su DB con costi giornalieri fissi e moltiplicatori domanda certificati.
- **Gravità imbroglio**: **Bassa / Media**.

#### 11.2. Lobbying Parlamentare e Decreti
- **Come si muove oggi**: `passLobbyLaw` in `ui-politics.js` usa `CE_money.spend(tangente)` e chiama `syncCash`.
- **Cosa controlla lato server**: Nessuna RPC (decreti in `22_server_decrees.sql` parzialmente scaffolded).
- **Cosa dovrebbe controllare una RPC sicura**: `rpc_bribe_politician(law_id)` con costo calcolato in base all'impatto della legge sul mercato.
- **Gravità imbroglio**: **Media**.

---

### Sezione 12: Ricompense Giornaliere & Missioni

#### 12.1. Bonus Login Giornaliero / Ordini del Giorno
- **Come si muove oggi**: `claimDailyOrder` / `claimDailyReward` in `daily-orders.js` usa `CE_money.earn(premio)` + `CE_money.addReputation`.
- **Cosa controlla lato server**: Nessun controllo, si appoggia a `rpc_sync_cash`.
- **Cosa dovrebbe controllare una RPC sicura**:
  - Tabella `daily_claims` con timestamp dell'ultimo claim (`claim_date = CURRENT_DATE`).
  - Prevenzione riscossione multipla nello stesso giorno solare (anti-replay).
- **Gravità imbroglio**: **Media / Alta** (se ripetuto in loop riaprendo l'app).

#### 12.2. Ricompense Missioni e Obiettivi (Quests / Tracker)
- **Come si muove oggi**: `claimQuestReward` in `quests.js` accredita denaro/DC via `CE_money.earn` / `earnDC`.
- **Cosa controlla lato server**: Solo `rpc_sync_cash` e `rpc_add_driver_coins`.
- **Cosa dovrebbe controllare una RPC sicura**: Validazione server dei requisiti della quest prima dell'erogazione del reward.
- **Gravità imbroglio**: **Media**.

---

### Sezione 13: Fallimento & Reset Prestigio

#### 13.1. Pignoramento Fallimentare (Bancarotta)
- **Come si muove oggi**: `_triggerBankruptcy` in `engine-finance.js` resetta la cassa a 800€, cancella debiti e veicoli non essenziali e sincronizza con `ServerState.syncCash`.
- **Cosa controlla lato server**: Riceve il nuovo stato tramite `syncCash`.
- **Cosa dovrebbe controllare una RPC sicura**: `rpc_declare_bankruptcy` che liquida gli asset sul DB e ripristina la compagnia con saldo iniziale controllato.
- **Gravità imbroglio**: **Media**.

#### 13.2. New Game Plus / Prestigio
- **Come si muove oggi**: `sellCompanyNGP` calcola il valore di liquidazione, resetta i veicoli, incrementa `prestige` e accredita il fondo iniziale.
- **Cosa controlla lato server**: Solo `rpc_sync_cash`.
- **Cosa dovrebbe controllare una RPC sicura**: Calcolo del bonus prestigio e liquidazione certificata sul DB.
- **Gravità imbroglio**: **Media**.

---

## 3. Matrice Comparativa di Rischio e Stato Attuale

| # | Azione Economica | Meccanismo Attuale | Validazione Server Attuale | Falla Principale | Gravità Cheat |
|---|---|---|---|---|---|
| 1 | **Acquisto Driver Coins** | `rpc_add_driver_coins` | Solo rate limit e cap numerico | Invocabile liberamente da chiunque senza Stripe | **CATASTROFICA** |
| 2 | **Spesa Driver Coins** | `rpc_ec_spend` | Solo verifica saldo totale | Prezzo passato dal client (`p_amount`) | **CRITICA** |
| 3 | **Mercato P2P (Veicoli/Quote)** | `rpc_buy_market_car` / `shares` | Atomica con lock, fondi controllati | Mancanza di ceiling sui prezzi (riciclaggio fondi) | **CRITICA** |
| 4 | **Mercato Token VTK** | `rpc_place/fill_vtk_order` | Atomica con row lock | Mancanza di circuit breaker sulla volatilità | **CRITICA** |
| 5 | **Core Loop Corse (Claim)** | `rpc_start_trip` + `claim` | Verifica solo tempo trascorso | Reward e durata passati dal client a piacere | **ALTA** |
| 6 | **Acquisto Veicoli Showroom** | `rpc_buy_vehicle` | Lock su azienda, `cash >= v_price` | Prezzo deciso dal client (`v_price = 0`) | **ALTA** |
| 7 | **Assunzione Staff / Autisti** | `rpc_hire_driver` | `cash >= salary * 2` | Stipendio deciso dal client (`v_salary = 0`) | **ALTA** |
| 8 | **Prestiti Bancari** | `rpc_take_loan` | Max 3 prestiti | Capitale e rata decisi dal client | **ALTA** |
| 9 | **Aste Giudiziarie** | `rpc_place_bid` + `claim` | Controllo offerta minima e vincitore | Mancanza di cauzione vincolata (*escrow*) al bid | **ALTA** |
| 10 | **Contratti B2B / Turismo** | `rpc_b2b/tourism_daily_tick` | Tick giornaliero con payout server | Mancata validazione server della flotta allocata | **ALTA** |
| 11 | **Riparazioni Flotta** | `rpc_repair_vehicle` | Proprietà, stato veicolo, fondi | Costo passato dal client (`v_cost = 0`) | **MEDIA** |
| 12 | **Upgrade Veicoli** | `rpc_buy_vehicle_upgrade` | Proprietà, stato `IDLE`, no dupes | Prezzo passato dal client | **MEDIA** |
| 13 | **Creazione Alleanze / Consorzi** | `CE_money.spend` + RPC | Solo unicità e lunghezza nome | Quota 25.000€ scalata solo in locale | **MEDIA** |
| 14 | **Daily Reward / Quest** | `CE_money.earn` + `syncCash` | Nessuna (tutto nel client) | Replay exploit ricaricando l'app | **MEDIA** |
| 15 | **Spese Minori (Multe, Hotel)** | `CE_money.spend` / RPC | Nessuna o costo dal client | Impatto economico circoscritto | **BASSA** |

---

## 4. Piano di Migrazione Ordinato per Priorità

Per implementare una vera architettura *server-authoritative* senza bloccare lo sviluppo, la migrazione deve procedere per scaglioni di priorità rigorosi:

### Priorità 1: Sicurezza Valuta Premium & Monetizzazione Reale (Immediata)
- **Motivazione**: Riguarda il denaro reale, le entrate economiche del progetto e la sostenibilità aziendale.
- **Azioni**:
  1. Revocare i permessi di esecuzione di `rpc_add_driver_coins` al ruolo `authenticated`.
  2. Implementare la validazione crittografica lato server tramite webhook Stripe (`service_role`).
  3. Bloccare `rpc_ec_spend` obbligando la risoluzione del costo tramite catalogo prezzi server (`driver_coins_store_catalog`).

### Priorità 2: Integrità Economica Multiplayer (P2P, Aste, VTK, Consorzi, OPA)
- **Motivazione**: Gli imbrogli nei sistemi multiplayer danneggiano direttamente gli altri giocatori legittimi e distruggono la leaderboard e la fiducia della community.
- **Azioni**:
  1. Introdurre un sistema di *escrow* vincolato per le offerte nelle Aste Giudiziarie (`rpc_place_auction_bid`).
  2. Imporre tetti di oscillazione (*price bands*) nel mercato P2P per impedire trasferimenti illeciti di liquidità tra account.
  3. Spostare la quota di fondazione consorzio (25.000€) interamente all'interno di `rpc_create_alliance`.

### Priorità 3: Protezione del Core Loop (Corse, Contratti B2B, Bandi Turismo)
- **Motivazione**: È la fonte primaria di generazione di cassa nel gioco. Se un giocatore può generare miliardi completando corse da 1 ms, l'intera economia collassa.
- **Azioni**:
  1. Riscrivere `rpc_start_trip` per calcolare durata minima e ricompensa sul server a partire dalle coordinate delle città (`routesDB`).
  2. Validare lo stato effettivo della flotta e il rispetto degli SLA prima di erogare i payout dei contratti B2B e del Turismo.

### Priorità 4: Validazione Listini di Flotta & Personale (Showroom, Riparazioni, Staff)
- **Motivazione**: Rimuove il pattern "il server si fida del prezzo del client" da tutte le RPC operative.
- **Azioni**:
  1. Creare tabelle catalogo sul DB per prezzi veicoli (`catalog_cars`), upgrade (`catalog_upgrades`) e stipendi minimi staff (`catalog_driver_tiers`).
  2. Eliminare i parametri `v_price`, `v_cost`, `v_salary` dalle rispettive RPC (`rpc_buy_vehicle`, `rpc_repair_vehicle`, `rpc_hire_driver`), calcolandoli solo su PostgreSQL.

### Priorità 5: Finanza, Prestiti & Cassa Passiva
- **Motivazione**: Chiude le falle di generazione di liquidità arbitraria da prestiti e investimenti.
- **Azioni**:
  1. Vincolare `rpc_take_loan` a pacchetti di prestito precalcolati dal server.
  2. Spostare i claim delle ricompense giornaliere su tabella `daily_claims` per prevenire il replay.

### Priorità 6: Deprecazione di `rpc_sync_cash` e Attivazione del Ledger Server-Authoritative
- **Motivazione**: Una volta completate le fasi 1-5, nessuna azione modificherà più il saldo in autonomia dal browser.
- **Azioni**:
  1. Attivare il trigger di enforcement `_enforce_cash_via_rpc()` in `42_economy_ledger_scaffold.sql`.
  2. Rimuovere definitivamente `rpc_sync_cash` (`10_sync_cash.sql`).
  3. A questo punto, il client diventa un terminale visuale al 100% immune a qualsiasi manipolazione tramite DevTools.
