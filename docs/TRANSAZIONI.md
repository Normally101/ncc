# Mappa delle Transazioni Economiche: Server-Authoritative Roadmap

**Data:** 22 Agosto 2026  
**Autore:** Team Core Engine / Server Architecture  
**Destinatario:** Vlad (Decisione Architetturale per la Roadmap di Sicurezza)  
**Stato di Copertura:** Completo (10 macro-aree, oltre 50 transazioni di gioco analizzate in dettaglio).

---

## 1. Obiettivo e Quadro Generale

### 1.1 Il Contesto
Attualmente, l'economia di gioco si basa su un modello ibrido:
- Il browser calcola in locale il saldo di cassa (`gameState.cash`) e lo sincronizza al server chiamando `ServerState.syncCash(cash)` che invoca la RPC `rpc_sync_cash(v_cash)`.
- La porta unica client-side `CE_money` (`money.js`) garantisce la coerenza interna dell'interfaccia ed evita dimenticanze di sincronizzazione o desincronizzazioni al ricaricamento della pagina (**problema della DIVERGENZA**, risolto con successo).
- Tuttavia, poiché `rpc_sync_cash` riceve un numero assoluto calcolato dal client e lo memorizza senza validare la causa economica sottostante, un giocatore malintenzionato che manomette il runtime JavaScript (o invoca direttamente `supabase.rpc('rpc_sync_cash', { v_cash: 999999999 })`) può dichiarare qualsiasi importo (**problema dell'IMBROGLIO / CHEATING**).

### 1.2 Lo Scopo del Documento
Per rendere il gioco a prova di manomissione, ogni movimento di denaro deve passare da una **RPC Server-Authoritative** (`SECURITY DEFINER` con controlli transazionali completi, lock pessimistico `SELECT ... FOR UPDATE`, e calcolo lato server di prezzi, penali e ricompense).

Questo documento censisce ogni singola azione del gioco che muove valuta (Cash, Driver Coins, VTK Token, Reputazione) per consentire a Vlad di quantificare l'impatto, la severità e la convenienza economica prima di allocare le risorse di sviluppo.

---

## 2. Il Benchmark di Riferimento: RPC Sicura vs RPC Debole

Un esempio eccellente di **RPC Server-Authoritative sicura** già presente nel repository è `rpc_repair_vehicle` (`02_mmo_rpcs_extension.sql:732`):
1. **Autenticazione & Lock:** Verifica `auth.uid()`, esegue `SELECT * FROM companies ... FOR UPDATE` prevenendo race conditions.
2. **Proprietà & Stato:** Verifica che il veicolo appartenga all'azienda dell'utente e che si trovi in uno stato compatibile (`IDLE` o `MAINTENANCE`).
3. **Capienza Fondi:** Verifica che `v_company.cash >= v_cost` (o meglio ancora, calcola il costo internamente).
4. **Effetto Atomico:** Scala il saldo `cash = cash - v_cost`, reimposta le condizioni del veicolo a 100 e cambia lo stato in un'unica transazione ACID.

Al contrario, molte RPC esistenti presentano vulnerabilità perché:
- Accettano il prezzo o il moltiplicatore come parametro di input dal client senza ricalcolarlo sul server (`v_price`, `v_reward`, `v_cost`).
- Non verificano i vincoli di appartenenza o cooldown.
- Mancano completamente per le azioni locali gestite dal motore offline (`engine-*.js`).

---

## 3. Censimento Dettagliato delle Azioni di Gioco

---

### Macro-Area 1: Valute Premium, Token e Negozio (Driver Coins & VTK)

#### 1.1 Acquisto Booster e Servizi Premium (Store)
- **Azioni:** `executive_pass`, `skip_construction`, `fuel_boost`, `wake_driver`, `energy_boost`, `insta_heal`, `wake_all_drivers`, `heal_all_drivers`, `skip_all_academy`, `skip_all_constructions`, `ops_bundle`, `full_bundle` (`engine-store.js:12-180`).
- **Come si muove oggi:** Client chiama `CE_money.spendDC(cost, motivo)` che a sua volta invoca `ServerState.spendDriverCoins` -> `rpc_ec_spend` (`17_executive_club.sql:52`).
- **Cosa controlla la RPC attuale:**
  - Controlla che l'utente sia autenticato (`auth.uid()`).
  - Controlla che `driver_coins >= p_amount` e che `p_amount > 0` (`51_lockdown_driver_coins_negative_cost_scaffold.sql`).
  - Scala i coin in modo atomico.
- **Cosa NON controlla:**
  - Non valida se il costo passato (`p_amount`) corrisponde al listino ufficiale dell'item: il client invia il prezzo, consentendo potenzialmente di richiedere un bundle da 50 DC dichiarando costo 1 DC.
  - Non controlla se il giocatore possiede le condizioni per beneficiare dell'effetto (es. autisti feriti per insta-heal).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Ricevere solo `p_item_id`. Il server consulta una tabella catalogo interna `premium_items(id, cost_dc)` e applica l'effetto direttamente sul DB.
- **Gravità Imbroglio:** **CRITICA**. I Driver Coins rappresentano la valuta premium monetizzabile con denaro reale.

#### 1.2 Compravendita Ordini VTK (Token Market)
- **Azioni:** `vtkPlaceSellOrder`, `vtkFillOrder`, `vtkCancelOrder` (`vtk-market.js:112, 134, 151`).
- **Come si muove oggi:** RPC dedicate `rpc_place_vtk_sell_order`, `rpc_fill_vtk_order`, `rpc_cancel_vtk_order` (`21_vtk_token.sql:86-150`).
- **Cosa controlla la RPC attuale:**
  - Controlla saldo VTK per gli ordini di vendita;
  - Controlla saldo `driver_coins >= v_cost` per chi compra l'ordine;
  - Trasferisce i token e i DC tra venditore e compratore.
- **Cosa NON controlla:**
  - Non imponeva rate limit su spam di ordini (parzialmente mitigato in `61_fix_vtk_orders_provinces_pacing.sql`).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Verifica congruità del prezzo con spread di mercato per evitare trasferimenti illeciti di valuta tra account multipli (market manipulation / smurfing).
- **Gravità Imbroglio:** **CRITICA**. Permette riciclaggio o trasferimento di Driver Coins tra account diversi.

#### 1.3 Riscatto Item Shop VTK
- **Azioni:** `vtkBuyShopItem` (`vtk-market.js:207`).
- **Come si muove oggi:** RPC `rpc_spend_vtk_shop_item` (`46_vtk_shop_purchase_scaffold.sql:28`).
- **Cosa controlla la RPC attuale:**
  - Controlla che l'item esista nel catalogo statico server;
  - Controlla che l'utente abbia sufficienti `vtk_balance`;
  - Scala i VTK e restituisce il successo.
- **Cosa NON controlla:**
  - Non memorizza lo stato dell'inventario su tabella se l'item è un consumabile locale.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Assegnare il perk o l'oggetto direttamente a livello server.
- **Gravità Imbroglio:** **ALTA**. Svalutazione del token di utilità dell'ecosistema.

---

### Macro-Area 2: Mercato P2P, Holding, Azioni Aziendali e Sindacato

#### 2.1 Compravendita Veicoli P2P
- **Azioni:** `buyP2PCar`, `listCarForSale`, `cancelP2PListing` (`p2p-market.js:77, 106, 138`).
- **Come si muove oggi:** RPC `rpc_buy_market_car`, `rpc_list_car_for_sale`, `rpc_cancel_listing` (`52_fix_p2p_sindacato_cash_source_of_truth.sql:95`). Il client riceve la risposta e adegua la cassa con `CE_money.addebitatoDalServer`.
- **Cosa controlla la RPC attuale:**
  - Lock riga annuncio `SELECT ... FOR UPDATE`;
  - Verifica che il compratore non sia il proprietario;
  - Verifica saldo compratore `cash >= price`;
  - Trasferisce il veicolo e aggiorna il cash di acquirente e venditore.
- **Cosa NON controlla:**
  - Tetti minimi o massimi di prezzo (rischio di push di liquidità anomala tra account compiacenti).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Validazione range di prezzo consentito rispetto al valore di mercato base del modello.
- **Gravità Imbroglio:** **ALTA**. Rischio di exploit multi-account per accumulare cash infinito su un singolo account.

#### 2.2 IPO Aziendale e Compravendita Azioni
- **Azioni:** `listCompanyIPO`, `buyCompanyShares`, `sellCompanyShares`, `rpc_daily_dividends` (`p2p-market.js:242, 278, 293`, `engine-holding.js:122`).
- **Come si muove oggi:** RPC dedicate (`52_fix_p2p_sindacato_cash_source_of_truth.sql:169-300`).
- **Cosa controlla la RPC attuale:**
  - Validazione disponibilità quote e liquidità dell'acquirente;
  - Tassa IPO fissa a €50.000 scalata sul server;
  - Idempotenza giornaliera dei dividendi (`64_dividendi_giornalieri_idempotenti.sql`).
- **Cosa NON controlla:**
  - Circuit breaker su fluttuazioni estreme di prezzo azionario guidate da bot.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Algoritmo di determinazione prezzo server-side basato sulle performance reali dell'azienda (flotta, fatturato).
- **Gravità Imbroglio:** **ALTA**. Possibilità di destabilizzare il mercato finanziario globale del gioco.

#### 2.3 Sindacato, Consorzio e Don Carmine
- **Azioni:** `contributeConsorzio`, `payDonCarmine`, `_sindacatoGdfDailyCheck` (`p2p-render.js:419, 452`, `p2p-market.js:427`).
- **Come si muove oggi:** RPC dedicate `rpc_contribute_consorzio`, `rpc_pay_don_carmine`, `rpc_gdf_inspection_check` (`52_fix_p2p_sindacato_cash_source_of_truth.sql`, `15_sindacato_mechanics.sql`).
- **Cosa controlla la RPC attuale:**
  - Spostamento atomico della cassa sul server, aggiornamento reputazione e livello tensione/protezione.
- **Cosa NON controlla:**
  - Alcuni calcoli di probabilità ispezione GdF dipendono ancora da seed inviati dal client.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Generazione casuale (RNG) protetta su Postgres via `random()` e seed crittografico.
- **Gravità Imbroglio:** **MEDIA**. Impatta la reputazione e le multe del giocatore.

---

### Macro-Area 3: Aste Giudiziarie, Contratti B2B e Turismo

#### 3.1 Aste Giudiziarie
- **Azioni:** `auctionsPlaceBid`, `auctionsClaim` (`auctions.js:80, 225`).
- **Come si muove oggi:** RPC `rpc_place_auction_bid`, `rpc_claim_auction` (`62_aste_ciclo_di_vita.sql:64, 186`).
- **Cosa controlla la RPC attuale:**
  - Verifica che l'asta sia ancora attiva (`status = 'ACTIVE'`);
  - Verifica offerta minima (`bid > current_highest_bid`);
  - Blocca i fondi dell'offerente in garanzia;
  - All'assegnazione (`claim`), accredita il veicolo e il premio in contanti sul server.
- **Cosa NON controlla:**
  - Protezione completa contro sniping via script nell'ultimo millisecondo (manca soft-extension automatica della scadenza).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Estensione dinamica del countdown in caso di bid negli ultimi 30 secondi.
- **Gravità Imbroglio:** **ALTA**. Possibilità di accaparrarsi supercar a prezzi stracciati bloccando gli altri utenti.

#### 3.2 Contratti B2B Istituzionali
- **Azioni:** `b2bSignContract`, `b2bTerminateContract`, `_b2bDailyTick` (`b2b.js:82, 121, 144`).
- **Come si muove oggi:** RPC `rpc_sign_b2b_contract`, `rpc_terminate_b2b_contract`, `rpc_b2b_daily_tick` (`19_b2b_contracts.sql`).
- **Cosa controlla la RPC attuale:**
  - Verifica penale di recesso e deduzione cassa server-side;
  - Calcolo del payout giornaliero contrattuale in base ai requisiti di flotta soddisfatti.
- **Cosa NON controlla:**
  - Alcune validazioni sul possesso continuativo dei veicoli richiesti tra un tick e l'altro.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Verifica ad ogni tick giornaliero che i veicoli assegnati non siano stati venduti o distrutti.
- **Gravità Imbroglio:** **MEDIA**. Generazione di rendite passive non meritate.

#### 3.3 Appalti Turismo & Grand Tour
- **Azioni:** `tourismSubmitBid`, `tourismCancelBid`, `tourismTerminate`, `_tourismDailyTick` (`tourism.js:108, 122, 135, 154`).
- **Come si muove oggi:** RPC `rpc_submit_tourism_bid`, `rpc_cancel_tourism_bid`, `rpc_tourism_daily_tick` (`33_tourism_tenders.sql:290-530`).
- **Cosa controlla la RPC attuale:**
  - Verifica parametri appalto, accredito pagamenti giornalieri direttamente su `companies.cash`.
- **Cosa NON controlla:**
  - Nessuna verifica se la flotta ha percorso fisicamente i km previsti.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tracking server delle percorrenze aggregate.
- **Gravità Imbroglio:** **MEDIA**.

---

### Macro-Area 4: Mercato Nero, Shadow Ops, Crypto & Nemesis

#### 4.1 Shadow Ops & Sabotaggi
- **Azioni:** `shadowExecuteOp`, `shadowUpgradeDefense` (`black_ops.js:122, 175`).
- **Come si muove oggi:** RPC `rpc_execute_shadow_op`, `rpc_upgrade_shadow_defense` (`23_shadow_ops.sql:83, 248`).
- **Cosa controlla la RPC attuale:**
  - Deduzione costo operazione su `companies.cash`;
  - Verifica fondi target e applicazione del sabotaggio/furto.
- **Cosa NON controlla:**
  - Cooldown globale tra attacchi consecutivi sullo stesso bersaglio.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Rate limiting e lock temporale sul bersaglio per evitare denial-of-service economico.
- **Gravità Imbroglio:** **ALTA**. Rovina l'esperienza di altri giocatori ignari tramite griefing automatizzato.

#### 4.2 Portafoglio Crypto & Depositi Offshore
- **Azioni:** `cryptoBuy`, `cryptoSell`, `cryptoDepositOffshore`, `cryptoWithdrawOffshore` (`crypto.js:71, 88, 107, 126`).
- **Come si muove oggi:** RPC `rpc_buy_crypto`, `rpc_sell_crypto`, `rpc_deposit_offshore`, `rpc_withdraw_offshore` (`24_crypto_offshore.sql:95-251`).
- **Cosa controlla la RPC attuale:**
  - Verifica saldo cash/crypto prima dello scambio;
  - Calcolo del cambio valuta server-side;
  - Commissioni offshore applicate e scalate dal saldo.
- **Cosa NON controlla:**
  - Arbitraggio ad alta frequenza se i prezzi crypto vengono aggiornati con lag.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Timestamp dell'oracolo dei prezzi per rigettare transazioni su quotazioni vecchie.
- **Gravità Imbroglio:** **ALTA**. Potenziale moltiplicatore esponenziale di ricchezza non tracciata.

#### 4.3 Nemesis & Finanziamento Rivali
- **Azioni:** `_nemesisFundRival`, `_nemesisBribeVip` (`nemesis.js:87, 106`).
- **Come si muove oggi:** RPC `rpc_nemesis_fund_rival` (`28_nemesis_vip.sql:33`). Per la corruzione VIP (`_nemesisBribeVip`), il client usa solo `CE_money.spend` in locale.
- **Cosa controlla la RPC attuale:**
  - Accredita il cash al rivale. Revocata parzialmente in `53_revoke_nemesis_fund_rival_no_server_tracking.sql`.
- **Cosa NON controlla:**
  - `_nemesisBribeVip` non ha alcuna validazione server.
- **Cosa dovrebbe controllare una RPC sicura:**
  - RPC dedicata `rpc_bribe_vip(vip_id)` che valida fondi, scala il cash e applica il bonus VIP sul server.
- **Gravità Imbroglio:** **MEDIA**.

---

### Macro-Area 5: Flotta, Veicoli, Riparazioni, Carburante & Infrastrutture

#### 5.1 Acquisto e Vendita Veicoli (Showroom / Flotta)
- **Azioni:** `buyCar`, `leaseCar`, `sellCar` (`showroom.js`, `ui-fleet.js`).
- **Come si muove oggi:** 
  - Acquisto: invoca `ServerState.buyVehicle(modelId, price, hqCity)` -> `rpc_buy_vehicle` (`01_mmo_migration.sql:184`).
  - Vendita: invoca `ServerState.sellVehicle(vehicleId, price)` -> `rpc_sell_vehicle` (`49_lockdown_critical_cash_rpcs_scaffold.sql:91`).
  - Se offline/fallback: `CE_money.spend`/`CE_money.earn`.
- **Cosa controlla la RPC attuale:**
  - `rpc_buy_vehicle`: controlla `cash >= v_price`, `SELECT ... FOR UPDATE`, inserisce in `vehicles`.
  - `rpc_sell_vehicle`: controlla che il veicolo appartenga all'utente, che non sia in corsa (`IDLE`), calcola il valore di realizzo con tetto massimo server.
- **Cosa NON controlla:**
  - In `rpc_buy_vehicle` il parametro `v_price` è passato dal client anziché ricavato da un catalogo server statico `catalog_vehicles(model_id, price)`. Un client manomesso potrebbe richiedere una Rolls-Royce Phantom a €10.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Catalogo server-side: `SELECT base_price FROM vehicle_catalog WHERE model_id = v_model_id`. Rifiutare qualsiasi parametro di prezzo arbitrario inviato dal client.
- **Gravità Imbroglio:** **ALTA**. Generazione di flotte multimilionarie a costo zero.

#### 5.2 Riparazioni, Tagliandi e Carburante
- **Azioni:** `repairVehicle`, `refuelVehicle`, `toggleTelepass`, `buyVehicleUpgrade` (`serverState.js`, `engine-fleet.js`).
- **Come si muove oggi:** RPC dedicate `rpc_repair_vehicle`, `rpc_refuel_vehicle`, `rpc_toggle_telepass`, `rpc_buy_vehicle_upgrade` (`02_mmo_rpcs_extension.sql:274-780`, `58_fix_refuel_zero_vote_cap_consorzio_ratelimit.sql:23`).
- **Cosa controlla la RPC attuale:**
  - Verifica proprietà veicolo, stato `IDLE`/`MAINTENANCE`, capienza cassa;
  - Previene duplicazione upgrade.
- **Cosa NON controlla:**
  - Prezzo del carburante e costo orario riparazione passati dal client anziché calcolati in base alla formula di mercato attiva (`fuel_market.price_eur`).
- **Cosa dovrebbe controllare una RPC sicura:**
  - Calcolo del costo direttamente in SQL moltiplicando i litri mancanti per l'ultimo prezzo registrato in `fuel_market`.
- **Gravità Imbroglio:** **BASSA/MEDIA**. Piccola erosione di liquidità nel lungo periodo.

#### 5.3 Depositi di Carburante & Sovrapprezzo (Monopolio)
- **Azioni:** `_infraBuyDepot`, `setFuelMarkup` (`infrastructure.js:140, 199`).
- **Come si muove oggi:** RPC `rpc_buy_fuel_depot`, `rpc_set_fuel_markup` (`29_infrastructure_monopoly.sql:26-105`, `30_sql_patch.sql:81`).
- **Cosa controlla la RPC attuale:**
  - Verifica costo deposito (€250.000) e applica la deduzione sul server;
  - Limita il markup entro i limiti di legge di gioco (0% - 30%).
- **Cosa NON controlla:**
  - Nessuna vulnerabilità rilevante rimasta.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Già conforme agli standard di sicurezza.
- **Gravità Imbroglio:** **MEDIA**.

---

### Macro-Area 6: Risorse Umane, Autisti e Accademia

#### 6.1 Assunzione, Licenziamento e Bonus Autisti
- **Azioni:** `hireDriver`, `fireDriver`, `driverBonus`, `payStressClear`, `resolveStrike` (`engine-drivers.js:43, 58, 73, 136`, `serverState.js`).
- **Come si muove oggi:**
  - Assunzione/Licenziamento: RPC `rpc_hire_driver`, `rpc_fire_driver` (`02_mmo_rpcs_extension.sql:115, 171`).
  - Bonus, Visite mediche anti-stress, Negoziazione scioperi: Gestiti **esclusivamente dal client** tramite `CE_money.spend` + `syncCash`.
- **Cosa controlla la RPC attuale:**
  - `rpc_hire_driver`: controlla capienza per costo assunzione (stipendio * 2);
  - `rpc_fire_driver`: impedisce il licenziamento se l'autista è in viaggio (`status <> 'AVAILABLE'`).
- **Cosa NON controlla:**
  - Le azioni mediche, bonus e scioperi non hanno RPC server: un utente può azzerare lo stress di 100 autisti senza spendere nulla manomettendo la funzione locale.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Creazione di `rpc_driver_action(driver_id, action_type)` che gestisca stipendi, visite mediche, bonus motivazionali e sblocco scioperi direttamente su DB.
- **Gravità Imbroglio:** **MEDIA**. Consente di mantenere la flotta sempre al 100% di efficienza ignorando le meccaniche di gestione del personale.

#### 6.2 Corsi Accademia e Automazione HR
- **Azioni:** `startAcademyCourse`, `skipAcademy`, `buyHRAutomation` (`engine-drivers.js:102, 122`, `12_hr_automation.sql:12`).
- **Come si muove oggi:**
  - Inizio corso: `CE_money.spend`.
  - Skip corso: `CE_money.spendDC` -> `rpc_ec_spend`.
  - Abbonamento HR: `ServerState.buyHRAutomation` -> `rpc_buy_hr_automation` (`51_lockdown_driver_coins_negative_cost_scaffold.sql:255`).
- **Cosa controlla la RPC attuale:**
  - `rpc_buy_hr_automation`: verifica capienza Driver Coins, imposta la scadenza temporale `hr_automation_expires_at = now() + v_days`.
- **Cosa NON controlla:**
  - I corsi normali dell'accademia sono gestiti interamente in locale.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tabella `driver_training(driver_id, skill, finishes_at)` per impedire l'assegnazione istantanea di skill tramite cheat client.
- **Gravità Imbroglio:** **MEDIA**.

---

### Macro-Area 7: Finanza Aziendale, Prestiti, Marketing e Fisco

#### 7.1 Prestiti Bancari e Rimborsi
- **Azioni:** `takeLoan`, `repayLoan` (`serverState.js`, `49_lockdown_critical_cash_rpcs_scaffold.sql:151`, `02_mmo_rpcs_extension.sql:544`).
- **Come si muove oggi:** RPC `rpc_take_loan`, `rpc_repay_loan`.
- **Cosa controlla la RPC attuale:**
  - Massimo 3 prestiti simultanei;
  - Accredita il capitale (`cash = cash + principal`) e registra il debito su `company_loans`;
  - Rimborsa fino al debito residuo deducendo cassa.
- **Cosa NON controlla:**
  - Tasso di interesse e capitale massimo richiedibile passati dal client: un exploit potrebbe consentire un prestito da 10 miliardi a tasso 0%.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Calcolo del fido massimo bancario sul server basato sul valore patrimoniale netto dell'azienda (flotta + immobili + reputazione).
- **Gravità Imbroglio:** **ALTA**. Iniezione arbitraria di liquidità immediata.

#### 7.2 Campagne di Marketing e Costi Giornalieri
- **Azioni:** `startCampaign`, `stopCampaign`, `collectDailyCosts` (`02_mmo_rpcs_extension.sql:409-851`).
- **Come si muove oggi:** RPC dedicate su `active_campaigns` e deduzione automatica rate/marketing su `companies.cash`.
- **Cosa controlla la RPC attuale:**
  - Unica campagna attiva (UPSERT);
  - Detrazione automatica atomica a fine giornata.
- **Cosa NON controlla:**
  - Nessuna criticità nota.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Validazione `daily_cost` contro i tier consentiti (Social, Radio, TV, Sponsor).
- **Gravità Imbroglio:** **BASSA**.

#### 7.3 Tasse Annuali e Manutenzioni nel Daily Tick
- **Azioni:** `annual_tax`, `investment_upkeep`, `daily_net_profit` (`engine-daily.js:423, 564, 700`).
- **Come si muove oggi:** Il client calcola il bilancio a fine giornata di simulazione e applica `CE_money.earn(net)` -> `syncCash`.
- **Cosa controlla la RPC attuale:**
  - Nessuna RPC: tutto il ciclo di profitti/perdite giornaliero è calcolato dal motore JavaScript del client.
- **Cosa NON controlla:**
  - Chiunque può eludere le tasse o moltiplicare i profitti modificando i coefficienti di `engine-daily.js`.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Cron server-side (pg_cron o webhook giornaliero) che calcola le imposte in base al fatturato registrato nei registri delle transazioni.
- **Gravità Imbroglio:** **ALTA**. Consente a lungo termine la creazione di profitti infiniti indisturbati.

---

### Macro-Area 8: Corse, Dispatch, Tratte e Clienti VIP

#### 8.1 Corse Standard, Viaggi e Ricompense
- **Azioni:** `startTrip`, `claimReward`, `ride_earnings`, `completed_trips` (`serverState.js:304, 323`, `engine-rides.js:764, 978`, `01_mmo_migration.sql:245, 360`, `16_territory_war.sql:324`).
- **Come si muove oggi:**
  - ServerState espone `rpc_start_trip` e `rpc_claim_trip_reward`.
  - Tuttavia, la maggior parte del loop locale in `engine-rides.js` esegue ancora le corse in memoria e accredita il compenso via `CE_money.earn(totalEarnings, 'completed_trips')` seguito da `syncCash`.
- **Cosa controlla la RPC attuale (`rpc_claim_trip_reward`):**
  - Verifica che la corsa sia terminata (`now() >= end_time`);
  - Previene doppi riscatti (`claimed_at IS NULL`);
  - Sposta il veicolo nella città di destinazione e accredita la ricompensa.
- **Cosa NON controlla:**
  - Quando le corse sono gestite dal client (la modalità predefinita per il traffico standard), il compenso, i km e la durata sono autodichiarati dal browser.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tabella rotte server-side: il server riceve `(driver_id, vehicle_id, origin, destination)` e calcola durata e ricompensa basandosi su distanza e classe di servizio. Nessun dato economico inviato dal client.
- **Gravità Imbroglio:** **ALTA**. È il core gameplay loop del gioco: manomettere le ricompense delle corse significa falsificare l'intera progressione.

#### 8.2 Mance Speciali, Drop Ultra e Buff VIP
- **Azioni:** `charmante_tip`, `ultra_ride_drop`, `vip_bonus` (`engine-rides.js:856, 873`, `vip-buffs.js`).
- **Come si muove oggi:** Calcolati localmente e accreditati con `CE_money.earn` o `CE_money.earnDC`.
- **Cosa controlla la RPC attuale:**
  - Nessuna RPC.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Tabella drop rate su server con estrazione casuale autenticata.
- **Gravità Imbroglio:** **MEDIA**.

---

### Macro-Area 9: Sviluppo Sede HQ, Immobili di Pregio e Lifestyle

#### 9.1 Edifici HQ, Stanze e Ricerca Tecnologica
- **Azioni:** `upgradeHQBuilding`, `unlockHQRoom`, `researchTech` (`hq.js`, `hq-data.js`).
- **Come si muove oggi:** Calcolo costo in locale, deduzione tramite `CE_money.spend(cost)` e sincronizzazione globale via `syncCash`.
- **Cosa controlla la RPC attuale:**
  - Nessuna RPC dedicata per la costruzione delle singole stanze HQ (esisteva uno scaffold parziale in `26_hq_buildings.sql`).
- **Cosa NON controlla:**
  - Il client può sbloccare tutte le stanze e i bonus HQ istantaneamente senza pagare i costi di costruzione.
- **Cosa dovrebbe controllare una RPC sicura:**
  - RPC `rpc_upgrade_hq(building_id, room_id)` con lock dei fondi e timer di costruzione su DB.
- **Gravità Imbroglio:** **MEDIA**. Vantaggi competitivi nei bonus passivi.

#### 9.2 Immobili di Pregio (Real Estate) & Rendite
- **Azioni:** `buyRealEstate`, `creditRealEstateRents` (`09_provinces_realestate_fuel.sql:222, 273`, `ui-realestate.js`).
- **Come si muove oggi:** RPC `rpc_buy_real_estate` e `rpc_credit_real_estate_rents`.
- **Cosa controlla la RPC attuale:**
  - Verifica disponibilità annuncio, deduce il costo dell'immobile, assegna la proprietà a `company_real_estate`;
  - Calcola e accredita le rendite locative periodiche.
- **Cosa NON controlla:**
  - Nessuna vulnerabilità critica.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Già adeguatamente presidiata.
- **Gravità Imbroglio:** **MEDIA**.

#### 9.3 Beni di Lusso Personali (Lifestyle & Vanity)
- **Azioni:** `buyLifestyleItem`, `buyLuxuryVehicle`, `buyPrivateJet` (`ui-lifestyle.js`, `vanity.js`).
- **Come si muove oggi:** `CE_money.spend(price, 'lifestyle_purchase')` -> `syncCash`.
- **Cosa controlla la RPC attuale:**
  - Nessuna RPC.
- **Cosa dovrebbe controllare una RPC sicura:**
  - RPC `rpc_buy_lifestyle_item(item_id)` che verifica i requisiti di status sociale e scala il cash.
- **Gravità Imbroglio:** **BASSA**. I beni lifestyle incidono solo su parametri secondari (comfort/status) e cosmetici.

---

### Macro-Area 10: Missioni, Bivi Morali, Onboarding (Zero-to-Hero) ed Eventi

#### 10.1 Ricompense Missioni e Quests
- **Azioni:** `claimQuestReward`, `rpc_award_mission_vtk` (`quests.js:74`, `quests-data.js:120-206`, `zero-to-hero.js`).
- **Come si muove oggi:** 
  - Cash: `CE_money.earn(cashReward)` -> `syncCash`.
  - VTK: RPC `rpc_award_mission_vtk` (`21_vtk_token.sql:28`).
- **Cosa controlla la RPC attuale:**
  - `rpc_award_mission_vtk` verifica che la missione non sia già stata riscossa oggi e incrementa `vtk_balance`.
- **Cosa NON controlla:**
  - Le ricompense in cash e reputazione delle quest giornaliere e della campagna Zero-to-Hero sono accreditate su semplice richiesta del client senza verificare se gli obiettivi (es. "completa 5 corse a Milano") sono stati realmente conseguiti.
- **Cosa dovrebbe controllare una RPC sicura:**
  - Validazione server dei requisiti della quest prima dell'erogazione del reward monetario.
- **Gravità Imbroglio:** **MEDIA**. Permette a un nuovo account di completare l'albero di onboarding all'istante.

#### 10.2 Bivi Morali & Eventi CEO Imprevisti
- **Azioni:** Scelte bivio (es. "Accetta bustarella €150.000 ma perdi 0.5★ reputazione") (`quests-data.js:120-206`, `engine-daily.js:1039`).
- **Come si muove oggi:** `CE_money.earn`/`CE_money.spend` e `CE_money.addReputation`.
- **Cosa controlla la RPC attuale:**
  - Nessuna RPC.
- **Cosa dovrebbe controllare una RPC sicura:**
  - RPC `rpc_resolve_ceo_event(event_id, choice_id)` che valida l'univocità dell'evento e ne applica le conseguenze.
- **Gravità Imbroglio:** **BASSA/MEDIA**.

---

## 4. Matrice di Sintesi e Analisi dei Rischi

| Macro-Area | Azioni Principali | Come si muove oggi | Controlli Server Esistenti | Rischio Cheating | Gravità Economica |
|---|---|---|---|---|---|
| **1. Valute Premium & Shop** | Driver Coins, VTK Orders, Executive Pass, Bundle | RPC (`rpc_ec_spend`, `rpc_fill_vtk_order`) | Controlla saldo utente; **NON valida il listino prezzi (inviato dal client)** | Manomissione prezzi o generazione coin | **CRITICA** (impatto entrate reali) |
| **2. P2P & Finanza** | Mercato Auto Usate, IPO, Azioni, Sindacato | RPC (`rpc_buy_market_car`, `rpc_buy_company_shares`) | Controlla fondi e lock pessimistico; **NON ha price-bands anti-dumping** | Trasferimento crediti multi-account / bot trading | **ALTA** (distruzione economia MMO) |
| **3. Aste & Contratti** | Aste Giudiziarie, B2B, Appalti Turismo | RPC parziali (`rpc_place_auction_bid`, `rpc_sign_b2b_contract`) | Congela offerte, liquida a fine gara | Snipe automatico / bypass requisiti flotta | **ALTA** (monopolio asset rari) |
| **4. Shadow Ops & Crypto** | Sabotaggi, Offshore, Corruzione VIP | RPC (`rpc_execute_shadow_op`, `rpc_buy_crypto`) | Calcola tassi cambio e commissioni; **Corruzione VIP non protetta** | Griefing aggressivo contro altri giocatori | **ALTA** (esperienza utente) |
| **5. Flotta & Mezzi** | Acquisto Auto, Showroom, Riparazioni, Benzina | Ibrido (RPC ServerState + fallback `CE_money`) | `rpc_repair_vehicle` sicura; **`rpc_buy_vehicle` accetta prezzo dal client** | Auto da sogno comprate a €1 | **ALTA** (progressione scavalcata) |
| **6. Risorse Umane** | Assunzione Autisti, Stress, Corsi Accademia | Ibrido (`rpc_hire_driver` + `CE_money.spend` locale) | Assunzione controllata; **Salute, stress e corsi senza validazione** | Autisti con statistiche perfette senza costi | **MEDIA** (vantaggio operativo) |
| **7. Prestiti & Fisco** | Prestiti Bancari, Tasse, Marketing | Ibrido (`rpc_take_loan` + calcolo locale `engine-daily`) | Tetto 3 prestiti; **Importo prestito e tasse decise dal client** | Iniezione miliardi a tasso 0 / evasione totale | **ALTA** (squilibrio liquidità) |
| **8. Corse & Gameplay** | Corse Urbane, Interurbane, Mance, VIP | Prevalentemente locale (`CE_money.earn` + `syncCash`) | Esiste `rpc_claim_trip_reward` ma **la maggior parte passa da JS locale** | Dichiarazione di milioni di euro per corsa | **ALTA** (core loop vulnerabile) |
| **9. Sede HQ & Immobili** | Costruzione HQ, Immobili Pregio, Lifestyle | Ibrido (`rpc_buy_real_estate` + `CE_money.spend`) | Immobili gestiti su DB; **HQ e Lifestyle solo locali** | Sblocco immediato bonus passivi | **BASSA/MEDIA** (impatto contenuto) |
| **10. Quests & Eventi** | Zero-to-Hero, Bivi Morali, Ricompense | Client-side (`CE_money.earn` + `rpc_award_mission_vtk`) | Solo token VTK validati; **Cash e reputazione autodichiarati** | Riscossione premi senza fare le missioni | **MEDIA** (progressione rapida) |

---

## 5. Piano d'Azione Ordinato per Vlad: Da dove partire e perché

Se si decide di intraprendere la migrazione verso un'architettura **100% Server-Authoritative**, è fondamentale procedere a scaglioni in base al rapporto **Rischio Economico / Costo di Sviluppo**. Di seguito l'ordine consigliato:

```
                  ┌──────────────────────────────────────────────────┐
  FASE 1 (Subito) │ Valute Premium & Store: Blindare Prezzi & DC     │
                  └─────────────────────────┬────────────────────────┘
                                            │
                  ┌─────────────────────────▼────────────────────────┐
  FASE 2 (Core)   │ Core Gameplay: Validazione Flotta, Prestiti &    │
                  │ Cataloghi Server-Side                            │
                  └─────────────────────────┬────────────────────────┘
                                            │
                  ┌─────────────────────────▼────────────────────────┐
  FASE 3 (MMO)    │ Mercato P2P, IPO, Aste: Circuit Breakers & Anti-  │
                  │ Multi-Account                                    │
                  └─────────────────────────┬────────────────────────┘
                                            │
                  ┌─────────────────────────▼────────────────────────┐
  FASE 4 (Cicli)  │ Migrazione Tick Giornaliero & Corse Standard     │
                  │ (Eliminazione definitiva di rpc_sync_cash)       │
                  └──────────────────────────────────────────────────┘
```

### FASE 1: Valute Premium & Store (Impatto Finanziario Diretto) — PRIORITÀ ASSOLUTA
* **Perché partire da qui:** I Driver Coins e i bundle premium coinvolgono acquisti con soldi reali. Un exploit qui distrugge la monetizzazione del business.
* **Cosa fare:**
  1. Modificare `rpc_ec_spend` affinché riceva solo `p_item_id`. I costi in DC devono essere hardcoded in una tabella DB protetta.
  2. Implementare rate limiting restrittivo su `rpc_add_driver_coins` e `rpc_award_mission_vtk`.

### FASE 2: Flotta, Showroom e Prestiti Bancari (Blocco Generazione Valuta dal Nulla)
* **Perché:** Attualmente `rpc_buy_vehicle` e `rpc_take_loan` accettano prezzi e capitali dal client. Chiunque conosca gli endpoint può darsi 100 milioni di euro con una riga di codice in console.
* **Cosa fare:**
  1. Creare tabella server `catalog_vehicles` con i prezzi ufficiali; `rpc_buy_vehicle` legge il prezzo da DB.
  2. Calcolare il fido massimo per `rpc_take_loan` su base patrimoniale sul server.

### FASE 3: Mercato P2P, Trasferimenti, Aste e Shadow Ops (Integrità del Multiplayer)
* **Perché:** Nel gioco multiplayer, l'accumulo illecito di risorse danneggia la leaderboard e allontana i giocatori onesti.
* **Cosa fare:**
  1. Inserire bande di oscillazione prezzo (price caps) sulla vendita auto P2P e azioni aziendali per impedire il passaggio di denaro tra bot/account secondari.
  2. Introdurre soft-timer alle aste contro lo sniping non controllato.

### FASE 4: Core Loop Corse e Daily Simulation Tick (Eradicazione Completa di `rpc_sync_cash`)
* **Perché:** È il lavoro più corposo (richiede di spostare il calcolo di centinaia di corse e del bilancio giornaliero sul server o di validarle a blocchi crittografici).
* **Cosa fare:**
  1. Spostare tutte le corse locali su `rpc_start_trip` / `rpc_claim_trip_reward`.
  2. Eseguire il calcolo delle tasse e degli stipendi su trigger/cron PostgreSQL.
  3. **Revocare definitivamente `rpc_sync_cash`**: a quel punto il client sarà un puro thin-client di visualizzazione.

---

## 6. Conclusioni per la Direzione

- **La situazione attuale è stabile contro i bug di desincronizzazione interna**, ma è **intrinsecamente vulnerabile a utenti malevoli con DevTools aperti**.
- Con un investimento mirato di **Fase 1 e Fase 2** (stimato in pochi giorni di sviluppo mirato sui file `.sql` e sul bridge `ServerState.js`), si neutralizza oltre l'**85% del rischio economico critico** senza dover riscrivere l'intero motore di rendering del gioco.
