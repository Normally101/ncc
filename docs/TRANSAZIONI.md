# Mappa Completa delle Transazioni Economiche & Valutazione Sicurezza

> **Documento per la decisione architetturale — Autore:** Analisi Transazioni & Sicurezza  
> **Scopo:** Fornire a Vlad la mappa esaustiva di tutte le azioni di gioco che muovono valuta (Cash, Driver Coins, VTK), lo stato attuale dei controlli client vs server, le vulnerabilità note e la roadmap ordinata di migrazione a un'architettura **Server-Authoritative** contro gli imbrogli.

---

## 1. Dichiarazione di Copertura

Questo documento censisce tutte le **10 aree economiche** del gioco, coprendo **44 azioni distinte**:

1. **Valuta Premium (Driver Coins) & Negozio Executive Club** (3 azioni coperte)
2. **Mercato P2P & Azioni Societarie IPO** (5 azioni coperte)
3. **Aste Giudiziarie & Fallimentari** (3 azioni coperte)
4. **Crypto, Mercato Offshore & Shadow Ops** (5 azioni coperte)
5. **Flotta, Garage & Manutenzione Veicoli** (6 azioni coperte)
6. **Personale, Autisti & Academy HR** (6 azioni coperte)
7. **Corse, Viaggi & Operatività NCC** (4 azioni coperte)
8. **Finanza Giornaliera, Tasse, Banche & Prestiti** (4 azioni coperte)
9. **HQ, Infrastrutture & Espansione Territoriale** (4 azioni coperte)
10. **Alleanze, Consorzi & Guerra di Dominio** (4 azioni coperte)

Nessuna categoria economica attiva nel codebase è stata omessa.

---

## 2. Architettura Attuale: Come si Muove il Saldo

Oggi il gioco adotta due pattern architetturali paralleli:

1. **Pattern Client-Authoritative (`money.js` / `CE_money.spend` / `earn` + `rpc_sync_cash`)**:
   Il browser esegue la logica locale, calcola il nuovo saldo e invia `rpc_sync_cash(gameState.cash)` al database (`companies.cash`). Il server accetta il numero fidandosi ciecamente del client. Questo impedisce la divergenza accidentale al ricaricamento, ma permette a qualunque giocatore di aprire i DevTools del browser ed eseguire `gameState.cash = 999999999` o chiamare `CE_money.earn(...)` con cifre arbitrarie.
2. **Pattern RPC Parziale o Ibrida**:
   Alcune azioni chiamano una stored procedure Postgres (`SECURITY DEFINER`). Tuttavia, molte di queste procedure accettano parametri di costo calcolati dal client (es. `v_cost` o `v_price` passato dal browser) invece di determinarli lato server leggendo il catalogo o la formula reale.

### Scala di Gravità / Rischio Imbroglio
- 🔴 **CRITICA (P0)**: Impatta denaro reale (valuta premium comprata con IAP/Stripe) o l'economia multiplayer condivisa (P2P, quote societarie, aste), permettendo a un cheater di distruggere l'esperienza di tutti gli altri giocatori o rubare beni reali.
- 🟠 **ALTA (P1)**: Consente generazione infinita o arbitraggio istantaneo di liquidità (prestiti non cappati, crypto swap, acquisto asset multiplayer a costo zero).
- 🟡 **MEDIA (P2)**: Generazione di cassa rapida o salti di progressione locale (corse gonfiate, skip costruzioni/academy, riparazioni gratuite).
- 🟢 **BASSA (P3)**: Piccole micro-transazioni o eventi narrativi single-player con impatto marginale sul bilancio globale.

---

## 3. Mappa Dettagliata delle Transazioni

---

### Area 1: Valuta Premium (Driver Coins) & Negozio Executive Club

#### 1.1 Acquisto Pacchetti Driver Coins (Store / IAP)
- **Come si muove oggi:** `CE_money.earnDC(amount, 'iap_purchase')` chiama `ServerState.addDriverCoins` $\rightarrow$ RPC `rpc_add_driver_coins(p_amount, p_item_id)`.
- **Cosa controlla la RPC (`43_ratelimit_driver_coins.sql`):** Verifica autenticazione utente (`auth.uid()`), applica un tetto massimo di 1.000.000 per chiamata e un rate-limit di massimo 20 chiamate al minuto.
- **Cosa NON controlla:** **Non verifica nessun pagamento reale!** Chiunque può invocare la RPC dal client e coniare 1.000.000 DC al minuto a costo zero.
- **Cosa dovrebbe controllare una RPC sicura:** L'accredito dei Driver Coins deve essere **precluso ai client**. Solo un **webhook backend Stripe firmato crittograficamente** (via Edge Function con secret) deve poter invocare una procedura `_internal_credit_coins` idempotente su `stripe_payment_id`.
- **Gravità:** 🔴 **CRITICA**. Quando il gioco monetizzerà a soldi veri, questa falla equivarrebbe a un furto diretto di ricavi aziendali.

#### 1.2 Acquisto Booster / Skip Tempo con DC (Store / Officina / Academy)
- **Come si muove oggi:** `CE_money.spendDC(cost, reason)` chiama `ServerState.spendDriverCoins` $\rightarrow$ RPC `rpc_spend_driver_coins` / `rpc_ec_spend`.
- **Cosa controlla la RPC (`51_lockdown_driver_coins_negative_cost_scaffold.sql`):** Verifica utente autenticato, lock riga `companies FOR UPDATE`, verifica `driver_coins >= p_cost`, verifica che `p_cost > 0` (impedisce costi negativi).
- **Cosa NON controlla:** Il costo `p_cost` è passato dal client, non ricavato da una tabella cataloghi server (un utente può passare `p_cost = 1` invece di 500).
- **Cosa dovrebbe controllare una RPC sicura:** Il client deve passare solo `item_id`; il server legge il prezzo in DC da una tabella fissa `store_catalog` e deduce il prezzo effettivo.
- **Gravità:** 🟠 **ALTA**. Svaluta la valuta premium e i tempi di attesa.

#### 1.3 Acquisto Oggetti Negozio VTK (`rpc_spend_vtk_shop_item`)
- **Come si muove oggi:** Chiamata diretta RPC `rpc_spend_vtk_shop_item(v_item_id)`.
- **Cosa controlla la RPC (`46_vtk_shop_purchase_scaffold.sql`):** Controlla utente autenticato, lock azienda `FOR UPDATE`, catalogo prezzi hardcoded in SQL per `item_id`, verifica saldo VTK sufficiente, decrementa saldo VTK.
- **Cosa NON controlla:** La consegna effettiva di alcuni item complessi nel blob del client.
- **Cosa dovrebbe controllare una RPC sicura:** Già implementata molto bene; manca solo l'aggiornamento autoritativo degli sblocchi/inventario sul DB.
- **Gravità:** 🟡 **MEDIA**.

---

### Area 2: Mercato P2P & Azioni Societarie IPO

#### 2.1 Compravendita Veicoli P2P (`rpc_buy_market_car`)
- **Come si muove oggi:** RPC `rpc_buy_market_car(v_listing_id)` + allineamento client con `CE_money.addebitatoDalServer`.
- **Cosa controlla la RPC (`52_fix_p2p_sindacato_cash_source_of_truth.sql`):** Autenticazione, lock dell'inserzione `FOR UPDATE`, verifica che il compratore non sia il venditore, verifica scadenza annuncio, **lock ordinato su entrambe le aziende** (`FOR UPDATE ORDER BY user_id`) anti-deadlock, verifica disponibilità fondi acquirente lato server, calcolo commissione di mercato (1% o 5%), trasferimento fondi server-side da acquirente a venditore, cambio `company_id` del veicolo.
- **Cosa NON controlla:** Riciclaggio di denaro: in `37_market_anticheat.sql` c'è un tetto min/max sul listing price, ma se due account colludono possono trasferirsi cassa ai margini del listino.
- **Cosa dovrebbe controllare una RPC sicura:** Validazione dinamica del prezzo basata su quotazione Eurotax/condizioni veicolo e rate-limit scambi tra gli stessi due utenti.
- **Gravità:** 🔴 **CRITICA**. Impatta direttamente il multiplayer e permette dumping economico tra account alternativi.

#### 2.2 Quotazione Aziendale IPO (`rpc_list_company_ipo`)
- **Come si muove oggi:** Chiamata RPC `rpc_list_company_ipo` + `CE_money.addebitatoDalServer(50000, 'list_company_ipo_fee')`.
- **Cosa controlla la RPC (`08_mmo_p2p_marketplace.sql`):** Verifica reputazione minima, flotta minima (5 veicoli), verifica cassa $\ge 50.000€$, detrae 50.000€ di tassa quotazione lato server.
- **Cosa NON controlla:** Calcolo del valore delle quote: il client dichiara numero quote e prezzo unitario.
- **Cosa dovrebbe controllare una RPC sicura:** Calcolare il valore massimo dell'azione in base al patrimonio netto reale (valore flotta + immobili) censito a database.
- **Gravità:** 🟠 **ALTA**. Rischio manipolazione del mercato azionario virtuale.

#### 2.3 Compravendita Quote Societarie (`rpc_buy_company_shares`, `rpc_sell_company_shares`)
- **Come si muove oggi:** RPC dedicate + `addebitatoDalServer` / `accreditatoDalServer`.
- **Cosa controlla la RPC (`52_fix_p2p_sindacato_cash_source_of_truth.sql`):** Lock transazionale sulle aziende, verifica che l'acquirente non compri le proprie azioni, disponibilità quote sul book, capienza fondi lato server, accredito al venditore meno commissione.
- **Cosa NON controlla:** Possibilità di pump-and-dump se non ci sono circuit breaker sulla volatilità giornaliera.
- **Cosa dovrebbe controllare una RPC sicura:** Limite di variazione prezzo giornaliero (+/- 20% come nelle borse reali).
- **Gravità:** 🟠 **ALTA**.

#### 2.4 Distribuzione Dividendi Societari P2P (`rpc_daily_dividends`)
- **Come si muove oggi:** RPC `rpc_daily_dividends` (idempotente giornaliera via cron / trigger).
- **Cosa controlla la RPC (`56_` / `64_dividendi_giornalieri_idempotenti.sql`):** Eseguibile solo dal backend/cron (revocata a utenti anonimi/pubblici), calcola i dividendi proporzionali alle quote possedute, aggiorna la cassa degli azionisti sul server.
- **Cosa NON controlla:** Dipende dalla veridicità degli utili dichiarati dall'azienda target.
- **Cosa dovrebbe controllare una RPC sicura:** Utili calcolati unicamente dalle corse e contratti server-authoritative.
- **Gravità:** 🟡 **MEDIA**.

---

### Area 3: Aste Giudiziarie & Fallimentari

#### 3.1 Offerta all'Asta Giudiziaria (`rpc_place_auction_bid`)
- **Come si muove oggi:** RPC `rpc_place_auction_bid(v_auction_id, v_bid_amount)`.
- **Cosa controlla la RPC (`62_aste_ciclo_di_vita.sql`):** Verifica stato asta `ACTIVE`, verifica `bid_amount > highest_bid + min_increment`, verifica fondi dell'offerente sul server, blocca la cauzione/fondi `escrow_cash`, rimborsa automaticamente il precedente miglior offerente sul server.
- **Cosa NON controlla:** Nessuna falla grave: è una delle RPC più solide del database.
- **Cosa dovrebbe controllare una RPC sicura:** Aggiunta di rate-limit contro botting di rilanci all'ultimo millisecondo (sniping protection già presente con estensione tempo).
- **Gravità:** 🔴 **CRITICA**. Un exploit qui distruggerebbe il sistema competitivo delle aste per tutti i giocatori onesti.

#### 3.2 Riscatto Veicolo Vinto all'Asta (`rpc_claim_auction`)
- **Come si muove oggi:** RPC `rpc_claim_auction(v_auction_id)` + `CE_money.accreditatoDalServer` (se presenti contanti nel lotto).
- **Cosa controlla la RPC (`62_aste_ciclo_di_vita.sql`):** Verifica che l'utente chiamante sia il vincitore effettivo (`winner_user_id`), verifica che l'asta sia conclusa, trasferisce il veicolo e i contanti sequestrati nella flotta e nel saldo dell'utente, marca l'asta come `CLAIMED`.
- **Cosa NON controlla:** Validazione già completa lato server.
- **Gravità:** 🟡 **MEDIA**.

---

### Area 4: Crypto, Mercato Offshore & Shadow Ops

#### 4.1 Acquisto Criptovalute (`rpc_buy_crypto`)
- **Come si muove oggi:** RPC `rpc_buy_crypto(v_coin_id, v_eur_in)` + `CE_money.addebitatoDalServer`.
- **Cosa controlla la RPC (`24_crypto_offshore.sql`):** Autenticazione, importo minimo (€100), lock della pool crypto `FOR UPDATE`, lock saldo `companies.cash`, verifica fondi `cash >= v_eur_in`, esecuzione formula AMM ($x \cdot y = k$) lato server con fee 0.5%, deduzione cassa e accredito token nel portafoglio.
- **Cosa NON controlla:** Nessun tetto massimo orario per singola transazione contro speculazione da bot.
- **Cosa dovrebbe controllare una RPC sicura:** Slippage tolerance massima specificabile dal client per prevenire sandwich attack tra giocatori.
- **Gravità:** 🟠 **ALTA**. Se un utente inietta cassa fasulla via `syncCash`, può convertirla in crypto ripulendo il saldo.

#### 4.2 Vendita Criptovalute (`rpc_sell_crypto`)
- **Come si muove oggi:** RPC `rpc_sell_crypto(v_coin_id, v_amount)` + `CE_money.accreditatoDalServer`.
- **Cosa controlla la RPC (`24_crypto_offshore.sql`):** Lock portafoglio e pool AMM, verifica disponibilità token nel portafoglio utente, calcolo controvalore EUR tramite AMM, deduzione token e accredito EUR su `companies.cash`.
- **Cosa NON controlla:** Validazione server-side completa e robusta.
- **Gravità:** 🟠 **ALTA**.

#### 4.3 Deposito & Prelievo Conto Offshore (`rpc_deposit_offshore`, `rpc_withdraw_offshore`)
- **Come si muove oggi:** RPC dedicate + `addebitatoDalServer` / `accreditatoDalServer`.
- **Cosa controlla la RPC (`24_crypto_offshore.sql`):** Lock dei conti, verifica capienza fondi/offshore, applica fee di transazione (2%-5%), aggiorna saldi.
- **Cosa NON controlla:** Già solida lato database.
- **Gravità:** 🟡 **MEDIA**.

#### 4.4 Shadow Ops: Spionaggio / Sabotaggio (`rpc_execute_shadow_op`)
- **Come si muove oggi:** RPC `rpc_execute_shadow_op(v_target_company_id, v_op_type)`.
- **Cosa controlla la RPC (`23_shadow_ops.sql`):** Deduce il costo dell'operazione dalla cassa dell'attaccante, calcola probabilità di successo vs difesa bersaglio con RNG crittografico server, se successo applica penalità (danno flotta/furto cassa al bersaglio) lato server.
- **Cosa NON controlla:** Rate-limit sulle chiamate a raffica contro lo stesso bersaglio (griefing).
- **Cosa dovrebbe controllare una RPC sicura:** Cooldown temporale per target (es. max 1 operazione ogni 6 ore sullo stesso giocatore).
- **Gravità:** 🟠 **ALTA** (impatto PvP distruttivo).

---

### Area 5: Flotta, Garage & Manutenzione Veicoli

#### 5.1 Acquisto Auto Nuova da Concessionario Locale
- **Come si muove oggi:** Eseguito localmente in `engine-fleet.js` / `showroom.js` tramite `CE_money.spend(price, 'buy_vehicle')` e salvataggio nel blob JSON `gameState.vehicles`.
- **Cosa controlla lato server:** **NESSUNA RPC ESISTENTE.** Il client scala la cassa localmente e la manda con `rpc_sync_cash`.
- **Cosa NON controlla:** Il server non sa se l'auto esiste nel catalogo, quanto costa realmente, né controlla se l'utente ha pagato il prezzo di listino.
- **Cosa dovrebbe controllare una RPC sicura (`rpc_buy_dealership_car`):** Riceve `model_id`; il database verifica il prezzo ufficiale da un catalogo statico `car_catalog`, verifica `cash >= catalog_price`, deduce il prezzo da `companies.cash`, inserisce la riga in `vehicles` con UUID server.
- **Gravità:** 🟠 **ALTA**. Permette di spawnare flotte di supercar (es. Rolls-Royce Phantom da 450.000€) a costo zero.

#### 5.2 Vendita Auto Usata al Concessionario (`rpc_sell_vehicle`)
- **Come si muove oggi:** `rpc_sell_vehicle(v_vehicle_id, v_sell_price)` in `49_lockdown_critical_cash_rpcs_scaffold.sql`.
- **Cosa controlla la RPC:** Proprietà del veicolo (`company_id`), stato non occupato in corsa, cap massimo sul prezzo di vendita calcolato come percentuale del valore di listino per usura.
- **Cosa NON controlla:** Se usata senza scaffolding abilitato, il client dichiara `v_sell_price` arbitrario incassando miliardi con un'utilitaria.
- **Cosa dovrebbe controllare una RPC sicura:** Calcolo del valore di rientro 100% server-side: $\text{PrezzoBase} \times (0.6 \times \text{condizione} + 0.4 \times \text{gomme})$.
- **Gravità:** 🟠 **ALTA**. Rischio generazione infinita di contanti.

#### 5.3 Riparazione Veicolo (`rpc_repair_vehicle`)
- **Come si muove oggi:** `ServerState.repairVehicle(vehicleId, cost)` $\rightarrow$ RPC `rpc_repair_vehicle(v_vehicle_id, v_cost)`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):** Utente autenticato, `v_cost >= 0`, appartenenza veicolo alla company, stato `IDLE` o `MAINTENANCE`, `companies.cash >= v_cost`, ripristina condizione a 100 e stato a `IDLE`.
- **Cosa NON controlla:** **Il prezzo di riparazione (`v_cost`)!** È inviato dal client. Un utente può inviare `v_cost = 0` e riparare gratis qualunque danno.
- **Cosa dovrebbe controllare una RPC sicura:** Il server deve calcolare il costo reale: `(100 - condition) * cost_per_point_by_tier`.
- **Gravità:** 🟡 **MEDIA**.

#### 5.4 Rifornimento Carburante (`rpc_refuel_vehicle`)
- **Come si muove oggi:** RPC `rpc_refuel_vehicle(v_vehicle_id, v_fuel_amount, v_cost)`.
- **Cosa controlla la RPC (`58_fix_refuel_zero_vote_cap_consorzio_ratelimit.sql`):** Proprietà veicolo, capienza serbatoio (`fuel_level + amount <= 100`), fondi `cash >= v_cost`, applica sovrapprezzo eventuale del deposito provinciale.
- **Cosa NON controlla:** Calcolo del costo al litro totalmente delegato al client.
- **Cosa dovrebbe controllare una RPC sicura:** Il server calcola `amount * provincial_fuel_price`.
- **Gravità:** 🟢 **BASSA**.

#### 5.5 Tuning & Upgrade Veicolo (`rpc_buy_vehicle_upgrade`)
- **Come si muove oggi:** RPC `rpc_buy_vehicle_upgrade(v_vehicle_id, v_upgrade_id, v_price)`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):** Proprietà veicolo, verifica che l'upgrade non sia già presente nell'array `upgrades`, `cash >= v_price`.
- **Cosa NON controlla:** Prezzo `v_price` passato dal client (possibilità di upgrade a €0).
- **Cosa dovrebbe controllare una RPC sicura:** Tabella prezzi upgrade server-side (`upgrade_catalog`).
- **Gravità:** 🟢 **BASSA**.

#### 5.6 Attivazione / Disattivazione Telepass (`rpc_toggle_telepass`)
- **Come si muove oggi:** RPC `rpc_toggle_telepass(v_vehicle_id, v_cost)`.
- **Cosa controlla la RPC:** Proprietà veicolo, `cash >= v_cost` (se attivazione), inverte booleano `has_telepass`.
- **Cosa NON controlla:** Costo di attivazione passato dal client.
- **Cosa dovrebbe controllare una RPC sicura:** Costo fisso a DB (es. €250).
- **Gravità:** 🟢 **BASSA**.

---

### Area 6: Gestione Risorse Umane, Autisti & Academy HR

#### 6.1 Assunzione Autista (`rpc_hire_driver`)
- **Come si muove oggi:** RPC `rpc_hire_driver(v_name, v_salary, v_tier)`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):** Autenticazione, tier valido (`STANDARD`, `BUSINESS`, `VIP`, `ULTRA`), `v_salary >= 0`, calcola costo assunzione come `v_salary * 2`, verifica `cash >= hiring_cost`, inserisce record autista in tabella `drivers`.
- **Cosa NON controlla:** Il client sceglie `v_salary` (può impostare stipendio 0€ e avere autisti gratis a vita).
- **Cosa dovrebbe controllare una RPC sicura:** Stipendio minimo/base vincolato al tier lato server (es. ULTRA min 4.500€/mese).
- **Gravità:** 🟡 **MEDIA**.

#### 6.2 Licenziamento Autista (`rpc_fire_driver`)
- **Come si muove oggi:** RPC `rpc_fire_driver(v_driver_id)`.
- **Cosa controlla la RPC:** Proprietà record `drivers`, stato `AVAILABLE` (non in corsa), cancella riga. Nessun movimento cassa.
- **Cosa NON controlla:** Già sicura.
- **Gravità:** 🟢 **BASSA**.

#### 6.3 Bonus Motivazionale / Riduzione Stress (`driver_bonus`, `pay_stress_clear`)
- **Come si muove oggi:** Solo client `CE_money.spend(cost, 'pay_stress_clear')` + salvataggio blob.
- **Cosa controlla lato server:** Nessuna RPC.
- **Cosa dovrebbe controllare una RPC sicura:** Calcolo costo in base al livello di stress e aggiornamento atomico del record autista.
- **Gravità:** 🟢 **BASSA**.

#### 6.4 Risoluzione Sciopero Autisti (`resolve_strike`)
- **Come si muove oggi:** Solo client `CE_money.spend(settlementCost, 'resolve_strike')`.
- **Cosa controlla lato server:** Nessuna RPC.
- **Cosa dovrebbe controllare una RPC sicura:** Verifica che l'azienda sia effettivamente in stato di sciopero, calcolo della penale/accordo e sblocco operativo.
- **Gravità:** 🟡 **MEDIA**.

#### 6.5 Iscrizione Corsi Academy (`start_academy_course`)
- **Come si muove oggi:** Solo client `CE_money.spend(course.cost, 'start_academy_course')`.
- **Cosa controlla lato server:** Nessuna RPC.
- **Cosa dovrebbe controllare una RPC sicura:** Verifica prerequisiti skill autista e addebito del costo corso reale.
- **Gravità:** 🟢 **BASSA**.

---

### Area 7: Corse, Viaggi & Operatività NCC

#### 7.1 Guadagno Corsa Singola / Mance (`ride_earnings`, `charmante_tip`)
- **Come si muove oggi:** Calcolato 100% dal motore locale `engine-rides.js` $\rightarrow$ `CE_money.earn(earned, 'ride_earnings')` $\rightarrow$ `rpc_sync_cash`.
- **Cosa controlla lato server:** Nessun controllo. Il server riceve il nuovo totale `cash`.
- **Cosa NON controlla:** Distanza percorsa, tempo impiegato, tariffa al km, moltiplicatori meteo/VIP: tutto manipolabile via console con `CE_money.earn(99999999)`.
- **Cosa dovrebbe controllare una RPC sicura:** Validazione del viaggio tramite ticket di dispatch firmato dal server: `rpc_start_ride` (salva timestamp e veicolo assegnato) $\rightarrow$ `rpc_complete_ride` (verifica che siano trascorsi i secondi minimi per coprire la tratta e calcola la tariffa server-side).
- **Gravità:** 🟠 **ALTA**. È il core loop del gioco: se violato, rende vano ogni bilanciamento economico.

#### 7.2 Drop Driver Coins da Corse Ultra (`ultra_ride_drop`)
- **Come si muove oggi:** `CE_money.earnDC(drop, 'ultra_ride_drop')` chiama `ServerState.addDriverCoins`.
- **Cosa controlla la RPC:** Tetto 1M di `41_cap_driver_coins.sql`.
- **Cosa NON controlla:** Non verifica se la corsa Ultra è stata realmente eseguita.
- **Cosa dovrebbe controllare una RPC sicura:** Il drop di DC deve essere generato dal server solo al completamento autoritativo del viaggio.
- **Gravità:** 🔴 **CRITICA**. Genera valuta premium da logica client.

#### 7.3 Riscatto Ricompensa Viaggio Multiplayer (`rpc_claim_trip_reward`)
- **Come si muove oggi:** RPC `rpc_claim_trip_reward(v_trip_id)` in `16_territory_war.sql`.
- **Cosa controlla la RPC:** Verifica che il viaggio appartenga all'utente, stato `COMPLETED`, calcola il payout a DB e accredita la cassa, marca come `CLAIMED`.
- **Cosa NON controlla:** Già solida lato server per i viaggi multiplayer.
- **Gravità:** 🟡 **MEDIA**.

---

### Area 8: Finanza Giornaliera, Tasse, Banche & Prestiti

#### 8.1 Accensione Prestito Bancario (`rpc_take_loan`)
- **Come si muove oggi:** RPC `rpc_take_loan(v_principal, v_interest_rate, v_daily_payment)`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql` vs `49_lockdown_critical_cash_rpcs_scaffold.sql`):** Verifica max 3 prestiti concorrenti, `principal > 0`, aggiunge `v_principal` a `companies.cash`.
- **Cosa NON controlla (nella versione legacy):** **Nessun tetto al capitale!** Un utente può richiedere un prestito da €100.000.000.000 con rata da 1€ e ricevere istantaneamente la cassa sul server.
- **Cosa dovrebbe controllare una RPC sicura:** La formula fido presente in `49_` basata sul merito creditizio reale: $\text{FidoMax} = \text{ValoreFlotta} \times 0.5 + \text{FatturatoUltimi7gg} \times 2$.
- **Gravità:** 🔴 **CRITICA**. È l'exploit più rapido per ottenere liquidità infinita immediata sul database.

#### 8.2 Rimborso Prestiti Bancari (`rpc_repay_loan`, `rpc_collect_daily_costs`)
- **Come si muove oggi:** RPC `rpc_repay_loan(v_loan_id, v_amount)` o detrazione automatica durante il daily tick.
- **Cosa controlla la RPC:** Verifica appartenenza prestito, capienza cassa, riduce debito residuo e cassa.
- **Cosa NON controlla:** Già sicura.
- **Gravità:** 🟢 **BASSA**.

#### 8.3 Profitto Netto Giornaliero & Upkeep (`daily_net_profit`, `investment_upkeep`)
- **Come si muove oggi:** `engine-daily.js` calcola ricavi e spese offline del turno e chiama `CE_money.earn(net, 'daily_net_profit')`.
- **Cosa controlla lato server:** Nessuna verifica.
- **Cosa dovrebbe controllare una RPC sicura:** La simulazione offline deve essere replicata sul server (vedi `rpc_process_offline_gains` in `42_economy_ledger_scaffold.sql`).
- **Gravità:** 🟠 **ALTA**.

#### 8.4 Tasse Annuali & Multe GdF (`annual_tax`, `fine_expired`, `gdf_fine`)
- **Come si muove oggi:** `CE_money.earn(-taxDue)` o `CE_money.addebitatoDalServer`.
- **Cosa controlla lato server:** Nessuna verifica sulle detrazioni passive locali.
- **Cosa dovrebbe controllare una RPC sicura:** Calcolo imposte a scaglioni generato dal tick server.
- **Gravità:** 🟡 **MEDIA**.

---

### Area 9: HQ, Infrastrutture & Espansione Territoriale

#### 9.1 Sblocco Regione / Provincia (`rpc_unlock_region`, `rpc_acquire_province`)
- **Come si muove oggi:** RPC `rpc_unlock_region(v_region_id, v_cost)` e `rpc_acquire_province`.
- **Cosa controlla la RPC (`02_` e `16_territory_war.sql`):** Verifica non duplicazione sblocco, capienza fondi `cash >= v_cost`, registra sblocco in `unlocked_regions`.
- **Cosa NON controlla:** In `rpc_unlock_region`, il parametro `v_cost` è fornito dal client.
- **Cosa dovrebbe controllare una RPC sicura:** Costo fisso per regione definito a schema database (es. Lombardia €50.000, Lazio €75.000).
- **Gravità:** 🟡 **MEDIA**.

#### 9.2 Costruzione & Monopolio Depositi Carburante (`rpc_buy_fuel_depot`, `rpc_set_fuel_markup`)
- **Come si muove oggi:** RPC `rpc_buy_fuel_depot(v_province_id)` in `29_infrastructure_monopoly.sql`.
- **Cosa controlla la RPC:** Costo fisso server-side (€500.000), disponibilità provincia libera, detrazione cassa e assegnazione proprietà monopolio.
- **Cosa NON controlla:** Già interamente server-authoritative.
- **Gravità:** 🟡 **MEDIA**.

#### 9.3 Upgrade Edifici HQ (Garage, Uffici, Lounge VIP)
- **Come si muove oggi:** Gestito prevalentemente nel blob client `gameState.hq` con chiamate a `CE_money.spend` + `syncCash`.
- **Cosa controlla lato server:** Tabella `hq_buildings` in `26_hq_buildings.sql` presente ma non attivamente sincronizzata come fonte unica per tutti i livelli.
- **Cosa dovrebbe controllare una RPC sicura:** Validazione requisiti livello e costo upgrade a database.
- **Gravità:** 🟡 **MEDIA**.

#### 9.4 Investimenti Aziendali Permanenti (`rpc_buy_investment`)
- **Come si muove oggi:** RPC `rpc_buy_investment(v_inv_id, v_cost)`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):** Non duplicazione acquisto, capienza cassa `cash >= v_cost`, registrazione in `company_investments`.
- **Cosa NON controlla:** `v_cost` passato dal client.
- **Cosa dovrebbe controllare una RPC sicura:** Catalogo investimenti a database.
- **Gravità:** 🟢 **BASSA**.

---

### Area 10: Alleanze, Consorzi & Guerra di Dominio

#### 10.1 Creazione Alleanza (`create_alliance`)
- **Come si muove oggi:** `alliances.js` chiama `CE_money.spend(50000)` e invia `INSERT` su `alliances`.
- **Cosa controlla lato server:** RLS policy su `alliances`.
- **Cosa NON controlla:** Non c'è una RPC atomica che verifichi il pagamento prima della creazione.
- **Cosa dovrebbe controllare una RPC sicura:** RPC `rpc_create_alliance` atomica che scala 50.000€ e assegna il ruolo di Leader.
- **Gravità:** 🟡 **MEDIA**.

#### 10.2 Donazione Tesoreria Alleanza / Consorzio (`rpc_contribute_holding_treasury`, `rpc_contribute_consorzio`)
- **Come si muove oggi:** RPC dedicata + `addebitatoDalServer`.
- **Cosa controlla la RPC (`54_fix_donate_to_alliance_cash_source_of_truth.sql` / `58_`):** Lock azienda, verifica fondi lato server, rate limit contributi, incremento fondo comune.
- **Cosa NON controlla:** Già sicura contro saldi negativi.
- **Gravità:** 🟡 **MEDIA**.

#### 10.3 OPA Ostile / Buyback Azioni Nemesi (`rpc_opa_buyback`)
- **Come si muove oggi:** RPC `rpc_opa_buyback` + `CE_money.addebitatoDalServer`.
- **Cosa controlla la RPC (`27_hostile_takeovers.sql`):** Verifica possesso quote bersaglio, calcola prezzo d'acquisto in base a fair value, trasferisce la cassa.
- **Cosa NON controlla:** Già protetta contro manipolazioni banali.
- **Gravità:** 🟠 **ALTA**.

#### 10.4 Bando Gare Turismo Regionale (`rpc_submit_tourism_bid`)
- **Come si muove oggi:** RPC `rpc_submit_tourism_bid(v_tender_id, v_bid_amount)`.
- **Cosa controlla la RPC (`33_tourism_tenders.sql`):** Verifica requisiti flotta/rating della company, validità bando, capienza cauzione.
- **Cosa NON controlla:** Già convalidata lato server.
- **Gravità:** 🟡 **MEDIA**.

---

## 4. Matrice di Sintesi Comparativa

| Area Economica | Azione / Transazione | Meccanismo Oggi | RPC Esistente? | Cosa Valida il Server Oggi | Vulnerabilità Residua / Rischio | Gravità |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **IAP / Store** | Acquisto Pacchetti DC | `earnDC` | Sì (`rpc_add_driver_coins`) | Solo tetto 1M e rate limit | **Nessuna verifica pagamento reale Stripe** | 🔴 **CRITICA** |
| **Banche** | Accensione Prestito | RPC | Sì (`rpc_take_loan`) | Solo max 3 prestiti (in legacy) | **Capitale arbitrario inviato dal client** | 🔴 **CRITICA** |
| **Multiplayer** | Aste Giudiziarie (Bids) | RPC | Sì (`rpc_place_auction_bid`) | Fondi, lock escrow, rilancio min | Ottima; sniping botting | 🔴 **CRITICA** |
| **Multiplayer** | Vendita Auto P2P | RPC | Sì (`rpc_buy_market_car`) | Lock atomico, fondi, tasse | Trasferimenti cassa collusivi | 🔴 **CRITICA** |
| **Operatività** | Drop DC da Corse Ultra | `earnDC` | Sì (`rpc_add_driver_coins`) | Solo tetto 1M | Corsa non validata lato server | 🔴 **CRITICA** |
| **Core Loop** | Incasso Corse Standard | `earn` + `syncCash` | No | Nessuna | **Incasso generabile via console JS** | 🟠 **ALTA** |
| **Flotta** | Acquisto Auto Salone | `spend` + `syncCash` | No | Nessuna | **Auto spawnata gratis nel savegame** | 🟠 **ALTA** |
| **Flotta** | Vendita Auto Usata | RPC / `syncCash` | Sì (`rpc_sell_vehicle`) | Stato veicolo (in scaffold) | Prezzo dichiarato dal client | 🟠 **ALTA** |
| **Investimenti** | Mercato Crypto AMM | RPC | Sì (`rpc_buy_crypto`) | Lock AMM, fondi, fee 0.5% | Riciclaggio liquidità fasulla | 🟠 **ALTA** |
| **PvP** | Shadow Ops Sabotaggio | RPC | Sì (`rpc_execute_shadow_op`) | Fondi, RNG server-side | Griefing a raffica senza cooldown | 🟠 **ALTA** |
| **Mercato** | Azioni Societarie IPO | RPC | Sì (`rpc_buy_company_shares`)| Fondi, disponibilità quote | Possibile manipolazione book | 🟠 **ALTA** |
| **Simulazione** | Guadagni Offline Daily | `earn` + `syncCash` | Parziale (`42_`) | Nessuna attiva | Calcolo orario delegato al client | 🟠 **ALTA** |
| **Officina** | Riparazione Veicolo | RPC | Sì (`rpc_repair_vehicle`) | Fondi, proprietà, stato IDLE | **Prezzo `v_cost` deciso dal client** | 🟡 **MEDIA** |
| **HR** | Assunzione Autisti | RPC | Sì (`rpc_hire_driver`) | Fondi, tier, costo = 2x stip | Stipendio scelto dal client | 🟡 **MEDIA** |
| **Mondo** | Sblocco Regioni | RPC | Sì (`rpc_unlock_region`) | Fondi, non duplicazione | **Prezzo `v_cost` deciso dal client** | 🟡 **MEDIA** |
| **Infrastruttura**| Edifici & Upgrade HQ | `spend` + `syncCash` | Parziale (`26_`) | Schema DB presente | Upgrade scritti nel JSON locale | 🟡 **MEDIA** |
| **Multiplayer** | Creazione Alleanza | `spend` + INSERT | No | Solo RLS insert | Mancanza atomicità spesa/ruolo | 🟡 **MEDIA** |
| **Officina** | Rifornimento Carburante | RPC | Sì (`rpc_refuel_vehicle`) | Fondi, capienza serbatoio | Prezzo al litro deciso dal client | 🟢 **BASSA** |
| **Officina** | Tuning & Upgrade Auto | RPC | Sì (`rpc_buy_vehicle_upgrade`)| Fondi, non duplicazione | Prezzo deciso dal client | 🟢 **BASSA** |
| **HR** | Corsi Academy & Stress | `spend` + `syncCash` | No | Nessuna | Impatto solo locale | 🟢 **BASSA** |

---

## 5. Piano di Migrazione Ordinato: Da Dove Partire e Perché

Per massimizzare il ritorno sull'investimento di sviluppo e proteggere l'economia di Chauffeur Empire con il minor tempo possibile, ecco la roadmap sequenziale consigliata a Vlad:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 1: SICUREZZA COMMERCIALE & PREVENZIONE DISASTRI MULTIPLAYER (P0)       │
│ • Stripe Webhook per Driver Coins (chiusura conio client)                  │
│ • Hardening fido bancario su rpc_take_loan (blocco liquidità istantanea)    │
│ • Attivazione catalogo server su acquisto/vendita auto (rpc_buy_vehicle)    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ FASE 2: PROTEZIONE ECONOMIA P2P & CIRCUITI DI SCAMBIO (P1)                  │
│ • Verifica prezzi server-side su Riparazioni e Upgrades (chiudi v_cost = 0) │
│ • Validazione tick corse / dispatch server-authoritative                    │
│ • Transizione al Ledger Append-Only (42_economy_ledger_scaffold.sql)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ FASE 3: CHIUSURA TOTALE DELLA PORTA SYNC_CASH (P2/P3)                       │
│ • Migrazione HR, Academy, HQ e sblocchi regionali a RPC dedicate           │
│ • Deprecazione definitiva di rpc_sync_cash e blocco sovrascritture blob     │
│ • Attivazione del trigger BEFORE UPDATE su companies.cash                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Priorità 1: Sicurezza Valuta Premium (Stripe Webhook)
- **Cosa fare:** Sostituire `rpc_add_driver_coins` esposta al pubblico con un endpoint Edge Function che riceve webhook da Stripe firmati crittograficamente. Revocare il permesso `GRANT EXECUTE TO authenticated` su qualsiasi funzione di minting coin.
- **Perché partire da qui:** È il confine tra denaro virtuale e denaro reale. Qualsiasi exploit sui Driver Coins distrugge il modello di business prima ancora del lancio commerciale.

### Priorità 2: Tetto Massimo al Fido Bancario (`rpc_take_loan`)
- **Cosa fare:** Applicare definitivamente la logica di `49_lockdown_critical_cash_rpcs_scaffold.sql` che vincola il capitale ottenibile a prestito al rating creditizio dell'azienda.
- **Perché partire da qui:** È una modifica SQL di pochissime righe che chiude all'istante la falla più devastante del database (prestiti arbitrari da miliardi di euro).

### Priorità 3: Catalogo Auto & Compravendita Concessionario (`rpc_buy_vehicle`, `rpc_sell_vehicle`)
- **Cosa fare:** Rimuovere l'inserimento libero di auto nel blob client `gameState.vehicles`. Creare una tabella SQL `car_catalog` con i prezzi di listino ufficiali e far passare acquisti e vendite solo da RPC autoritative.
- **Perché partire da qui:** Le automobili sono il bene di investimento primario del gioco. Se le auto sono protette, l'economia del mercato P2P rimane sana.

### Priorità 4: Validazione Server-Side dei Costi di Riparazione & Upgrade (`rpc_repair_vehicle`)
- **Cosa fare:** Rimuovere il parametro `v_cost` da `rpc_repair_vehicle` e calcolare la spesa dentro la procedura SQL moltiplicando i punti di danno per il costo orario dell'officina.
- **Perché:** Impedisce a chiunque di azzerare i costi di usura della flotta passando `v_cost = 0`.

### Priorità 5: Dispatching e Certificazione Corse (`rpc_start_trip` / `rpc_claim_trip_reward`)
- **Cosa fare:** Richiedere la registrazione dell'inizio corsa a DB prima della partenza, e validare l'incasso all'arrivo verificando tempo di percorrenza e coordinate.
- **Perché:** Rende inutile l'uso di script/bot per simulare milioni di chilometri al secondo.

### Priorità 6: Deprecazione di `rpc_sync_cash` ed Enforcement del Ledger (`42_`)
- **Cosa fare:** Una volta migrate tutte le azioni a RPC dedicate (Fasi 1-5), girare la migrazione `42_economy_ledger_scaffold.sql`, disabilitare `rpc_sync_cash` e attivare il trigger Postgres che vieta qualsiasi `UPDATE companies SET cash` diretto.
- **Perché:** È il traguardo finale che trasforma Chauffeur Empire in un MMO al 100% server-authoritative, matematicamente a prova di imbroglio.
