# Mappatura e Analisi delle Transazioni Finanziarie

> **Scopo del documento:** Fornire a Vlad e al team un quadro analitico completo di ogni transazione economica in *Chauffeur Empire*.  
> Questo documento descrive lo stato attuale di ogni movimento di valuta, cosa viene validato lato server, cosa è vulnerabile alla manipolazione del client, il livello di gravità/impatto sul gioco e la priorità di migrazione.

---

## 1. Mappa di Copertura e Architettura Attuale

### 1.1 Come funziona la cassa oggi
Oggi il gioco adotta un'architettura mista:
1. **Flusso locale via `CE_money` e `rpc_sync_cash`**: Il client calcola il saldo (`gameState.cash`) ed esegue `ServerState.syncCash(cash)`. Lato server (`50_fix_sync_cash_asymmetric_delta.sql`), `rpc_sync_cash` accetta il valore numerico con un unico vincolo: l'incremento rispetto all'ultimo saldo registrato non può superare i 60.000.000 € a chiamata ed è rate-limitato a 30 chiamate/minuto. Nessun controllo viene fatto sulla motivazione economica dell'incremento.
2. **Flusso autoritativo via RPC (`SECURITY DEFINER`)**: Circa la metà delle transazioni passa per funzioni SQL dedicate (es. `rpc_buy_vehicle`, `rpc_repair_vehicle`, `rpc_buy_market_car`, `rpc_buy_crypto`). Queste scalano o accreditano direttamente su `companies.cash`.
3. **Ponte di allineamento (`accreditatoDalServer` / `addebitatoDalServer`)**: Quando un'azione usa una RPC autoritativa, `CE_money` aggiorna la proiezione locale in memoria senza richiamare `syncCash`, evitando doppie scritture o sovrascritture distruttive.
4. **Valuta Premium (`driver_coins`)**: Gestita tramite `spendDriverCoins` / `addDriverCoins` (`rpc_ec_spend`, `rpc_add_driver_coins`, ecc.).

### 1.2 Azioni analizzate in questo documento
Tutte le 14 aree del gioco sono coperte:
- **Sezione 2**: Driver Coins & Negozio Premium (Executive Club)
- **Sezione 3**: Flotta & Manutenzione Veicoli
- **Sezione 4**: Personale & Autisti (Staff)
- **Sezione 5**: Corse, Viaggi & Logistica (Dispatch)
- **Sezione 6**: Mercato P2P, Consorzi, Holding & Azioni IPO
- **Sezione 7**: Aste Giudiziarie
- **Sezione 8**: Finanza Aziendale, Prestiti & Immobiliare
- **Sezione 9**: Infrastrutture di Rifornimento & Monopoli
- **Sezione 10**: Crypto Market & Conti Offshore
- **Sezione 11**: Token VTK & Mercato Interno
- **Sezione 12**: Appalti Turistici & Contratti B2B
- **Sezione 13**: Shadow Ops (Guerra Clandestina)
- **Sezione 14**: Routine Giornaliera, Campagne, Eventi VIP & Vittorio
- **Sezione 15**: Classifica Ordinata delle Priorità di Intervento

---

## 2. Driver Coins & Negozio Premium (Executive Club)

### 2.1 Acquisto / Accredito Driver Coins
- **Come si muove oggi:** `ui-store.js` (`_dcSimPurchase`), `money.js` (`CE_money.earnDC`), `ServerState.addDriverCoins` -> chiama la RPC `rpc_add_driver_coins`.
- **Cosa controlla la RPC (`05_mmo_driver_coins.sql`, `41_cap_driver_coins.sql`, `43_ratelimit_driver_coins.sql`):**
  - Controlla l'autenticazione (`auth.uid()`).
  - Controlla che `p_amount > 0` e `p_amount <= 1.000.000`.
  - Rate-limit a 10 chiamate/minuto.
  - **Cosa NON controlla:** Non verifica alcuna transazione di pagamento reale (es. Stripe webhook, receipt store). Chiunque con DevTools può chiamare `rpc_add_driver_coins(1000000)` e coniare Driver Coins gratis.
- **Se non c'è / Cosa dovrebbe controllare:** Dovrebbe essere invocabile *solo* da webhook server-to-server autenticati (es. firma HMAC Stripe) con `SECURITY DEFINER` e revoca totale del `GRANT EXECUTE` per il ruolo `authenticated`.
- **Gravità Imbroglio:** 🔴 **CRITICA / MASSIMA**. Sono soldi reali dell'editore del gioco (IAP). Qualsiasi exploit qui distrugge direttamente il modello di business.

### 2.2 Spesa Driver Coins per Vantaggi & Skip (Store & Executive Club)
- **Come si muove oggi:** `ui-store.js`, `engine-store.js`, `vanity.js` usano `CE_money.spendDC`, che invoca `rpc_ec_spend` (`17_executive_club.sql`) o le RPC dedicate (`rpc_upgrade_offline_limit`, `rpc_buy_auto_rest`, `rpc_buy_energy_refill`, `rpc_buy_fleet_repair`, `rpc_buy_vip_contact`, `rpc_buy_hr_automation`).
- **Cosa controlla la RPC (`17_executive_club.sql`, `51_lockdown_driver_coins_negative_cost_scaffold.sql`):**
  - Controlla l'autenticazione e i fondi disponibili (`driver_coins >= p_amount`).
  - Controlla che l'importo sia strettamente positivo (`p_amount > 0`).
  - Scala direttamente dalla colonna `companies.driver_coins` e restituisce il saldo aggiornato.
  - **Cosa NON controlla:** Alcuni effetti (es. skip tempo cantiere, ripristino istantaneo energia autisti) sono applicati sul client (`gameState`) e non hanno una verifica dello stato di gioco sul database.
- **Gravità Imbroglio:** 🟠 **ALTA**. Sebbene il saldo DC sia protetto dal server, il client può fruire di booster multipli se non viene tracciato lo stato dell'entità target lato server.

---

## 3. Flotta & Manutenzione Veicoli

### 3.1 Acquisto Veicolo (Showroom & Concessionaria)
- **Come si muove oggi:** `showroom.js` (`_srmPurchase`) invoca `ServerState.buyVehicle` -> RPC `rpc_buy_vehicle`. In alternativa locale (es. auto NPC/prototipi legacy) passa per `CE_money.spend` -> `rpc_sync_cash`.
- **Cosa controlla la RPC (`01_mmo_migration.sql`):**
  - Lock pessimistico `FOR UPDATE` su `companies`.
  - Controlla `v_price >= 0` e `cash >= v_price`.
  - Genera targa italiana casuale univoca e inserisce la riga in `vehicles` con status `IDLE`. Scala il prezzo da `companies.cash`.
  - **Cosa NON controlla:** Non verifica il listino ufficiale dei veicoli (non esiste una tabella di catalogo sul DB; il modello è una stringa `v_model_id` e il prezzo è passato dal browser). Un utente può inviare `v_price = 0` o `1` per un'auto da 500.000 €.
- **Cosa dovrebbe controllare:** Una tabella server `vehicle_catalog(model_id, base_price, tier)` per forzare il prezzo reale dal database anziché fidarsi del client.
- **Gravità Imbroglio:** 🟡 **MEDIA**. Un utente può sbloccare veicoli top tier a 1 €, falsando la progressione locale e il valore flotta nelle classifiche.

### 3.2 Vendita Veicolo
- **Come si muove oggi:** `engine-fleet.js` chiama `ServerState.sellVehicle` -> RPC `rpc_sell_vehicle`.
- **Cosa controlla la RPC (`09_provinces_realestate_fuel.sql`, blindata in `49_lockdown_critical_cash_rpcs_scaffold.sql`):**
  - Controlla la proprietà del veicolo (`vehicles.id` associato a `company_id`).
  - Controlla che lo stato sia `IDLE` (non in corsa).
  - Controlla che il prezzo dichiarato dal client non superi `v_max_price = 25.000.000 €` e non sia negativo.
  - Elimina il veicolo e accredita `companies.cash`.
  - **Cosa NON controlla:** Il prezzo di vendita esatto calcolato con usura/km: un veicolo economico da 20.000 € può essere venduto dichiarando il cap massimo di 25.000.000 €.
- **Cosa dovrebbe controllare:** Calcolo del valore residuo server-side basato sul prezzo di catalogo del modello moltiplicato per `(condition / 100) * coefficiente_deprezzamento(mileage)`.
- **Gravità Imbroglio:** 🟠 **ALTA**. Permette di generare fino a 25.000.000 € vendendo una singola utilitaria.

### 3.3 Riparazione Veicolo / Manutenzione Flotta
- **Come si muove oggi:** `payToRepairCar` (`engine.js`) chiama `ServerState.repairVehicle` -> RPC `rpc_repair_vehicle`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):**
  - Verifica proprietà del veicolo e stato (`IDLE` o `MAINTENANCE`).
  - Verifica `cost >= 0` e `cash >= cost`.
  - Scala `cash` e reimposta `condition = 100`, `tire_pressure = 100`, `status = 'IDLE'`.
  - **Cosa NON controlla:** Il calcolo esatto del costo di riparazione: il prezzo è passato dal client.
- **Cosa dovrebbe controllare:** Calcolare il costo sul server in base ai punti danno: `costo = (100 - condition) * costo_punto_classe`.
- **Gravità Imbroglio:** 🟢 **BASSA**. Permette solo riparazioni gratis o sottopagate; non permette moltiplicazione o generazione diretta di denaro.

### 3.4 Rifornimento Carburante & Pressione Pneumatici
- **Come si muove oggi:** `refuelVehicle` / `refillCarTires` chiamano `ServerState.refuelVehicle` -> RPC `rpc_refuel_vehicle`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`, corretta in `58_fix_refuel_zero_vote_cap_consorzio_ratelimit.sql`):**
  - Verifica proprietà e liquidità (`cash >= v_cost`), con `v_cost >= 0` e `v_fuel_amount >= 0`.
  - Scala la cassa e aggiorna `fuel_level = LEAST(100, fuel_level + v_fuel_amount)`.
  - **Cosa NON controlla:** Il prezzo al litro del carburante rispetto a `fuel_market.price_eur`.
- **Gravità Imbroglio:** 🟢 **BASSA**.

### 3.5 Upgrade Veicolo & Telepass
- **Come si muove oggi:** `buyVehicleUpgrade` / `toggleTelepass` -> RPC `rpc_buy_vehicle_upgrade` / `rpc_toggle_telepass`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):**
  - Proprietà veicolo e stato `IDLE`.
  - Verifica che l'upgrade non sia già presente (`NOT (v_upgrade_id = ANY(upgrades))`).
  - Verifica fondi e scala cassa.
  - **Cosa NON controlla:** Il prezzo del singolo upgrade rispetto a un listino autoritativo.
- **Gravità Imbroglio:** 🟢 **BASSA**.

---

## 4. Personale & Autisti (Staff)

### 4.1 Assunzione Autista
- **Come si muove oggi:** `ServerState.hireDriver` -> RPC `rpc_hire_driver`. In engine locale: `CE_money.spend(cost, 'hire_driver')`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):**
  - Valida il tier (`STANDARD`, `BUSINESS`, `VIP`, `ULTRA`) e `v_salary >= 0`.
  - Calcola il costo di assunzione fisso server-side (`v_salary * 2`).
  - Verifica liquidità `cash >= v_hiring_cost` con `FOR UPDATE`.
  - Inserisce la riga in `drivers` e scala i soldi da `companies.cash`.
  - **Cosa NON controlla:** Il salary passato dal client: un utente potrebbe assumere un autista ULTRA con salary = 1 €.
- **Cosa dovrebbe controllare:** Minimo salariale per tier (es. ULTRA min 8.000 €/mese).
- **Gravità Imbroglio:** 🟢 **BASSA / TRASCURABILE**.

### 4.2 Licenziamento Autista
- **Come si muove oggi:** `ServerState.fireDriver` -> RPC `rpc_fire_driver`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):**
  - Verifica proprietà e che lo stato sia `AVAILABLE` (non in viaggio).
  - Cancella la riga da `drivers`. Nessun movimento monetario.
- **Gravità Imbroglio:** 🟢 **NULLA**.

### 4.3 Gestione Stress, Bonus, Sciopero & Accademia
- **Come si muove oggi:** `engine-drivers.js` (`driver_bonus`, `pay_stress_clear`, `resolve_strike`, `start_academy_course`) usano `CE_money.spend` -> `rpc_sync_cash`.
- **Cosa controlla lato server:** **NESSUNA RPC DEDICATA**. Il client scala il costo localmente e invia il nuovo saldo a `rpc_sync_cash`.
- **Cosa dovrebbe controllare una RPC:** Verificare l'esistenza dell'autista, lo stato di sciopero/stress, il costo da tabella e aggiornare lo stato dell'autista scalando la cassa in un'unica transazione.
- **Gravità Imbroglio:** 🟢 **BASSA**. Incide solo sulle meccaniche interne di fatica del personale.

---

## 5. Corse, Viaggi & Logistica (Dispatch & Rides)

### 5.1 Avvio Corsa e Rientro a Vuoto
- **Come si muove oggi:** `ServerState.startTrip` -> RPC `rpc_start_trip`.
- **Cosa controlla la RPC (`01_mmo_migration.sql`):**
  - Verifica proprietà di veicolo e autista, controlla che siano entrambi `IDLE`/`AVAILABLE` e nella stessa città (`v_vehicle.current_city = v_driver.current_city`).
  - Per i rientri a vuoto (`is_empty_return = true`): addebita i costi vivi di viaggio (`v_reward` usato come costo) da `companies.cash`.
  - Calcola il tempo di arrivo `end_time = now() + duration` (con -15% se ha Telepass) e crea la riga in `active_trips`.
  - **Cosa NON controlla:** Il reward dichiarato per le corse clienti e la durata del viaggio (calcolata dal client).
- **Gravità Imbroglio:** 🟡 **MEDIA**. Il client potrebbe impostare una durata minima (es. 1 secondo) per corse ad altissimo compenso.

### 5.2 Riscatto Ricompensa Corsa (Claim Reward)
- **Come si muove oggi:** `ServerState.claimReward` -> RPC `rpc_claim_trip_reward`.
- **Cosa controlla la RPC (`01_mmo_migration.sql`, `16_territory_war.sql`):**
  - Time-gate server-side rigoroso: `IF now() < v_trip.end_time THEN RAISE EXCEPTION`.
  - Accredita il `reward_cash` salvato alla partenza in `active_trips`, incrementa reputazione, calcola km e usura, applica tasse di transito del governatore della provincia (`_apply_province_transit_tax`), cancella la corsa attiva.
  - **Cosa NON controlla:** Non ricalcola la tariffa legittima (km × tariffa_classe × moltiplicatori meteo/traffico); si fida del `reward_cash` registrato in `start_trip`.
- **Cosa dovrebbe controllare:** Validazione server-side della tariffa massima in base alla rotta (città partenza -> città arrivo) e classe del veicolo.
- **Gravità Imbroglio:** 🟠 **ALTA**. Se combinata con `rpc_start_trip`, consente di generare guadagni gonfiati se il client passa un `reward` esagerato alla partenza.

### 5.3 Mance & Guadagni Corsa Locale
- **Come si muove oggi:** `engine-rides.js` (`ride_earnings`, `charmante_tip`, `ultra_ride_drop`, `completed_trips`) usa `CE_money.earn` / `earnDC` -> `rpc_sync_cash` / `rpc_add_driver_coins`.
- **Gravità Imbroglio:** 🟠 **ALTA** se usata per generare cash o DC via DevTools.

---

## 6. Mercato P2P, Consorzi, Holding & Azioni IPO

### 6.1 Compravendita Auto P2P
- **Come si muove oggi:** `p2p-market.js` (`buyP2PCar`) chiama `rpc_buy_market_car` (`52_fix_p2p_sindacato_cash_source_of_truth.sql`). `CE_money.addebitatoDalServer` aggiorna la memoria.
- **Cosa controlla la RPC:**
  - Lock ordinato `FOR UPDATE` su compratore e venditore (anti-deadlock).
  - Verifica che l'inserzione non sia scaduta e che il compratore non sia il venditore.
  - Verifica liquidità del compratore su `companies.cash`.
  - Applica la commissione di sistema del 5% (bruciata).
  - Trasferisce `net = ask_price * 0.95` al venditore e cancella l'inserzione.
  - **Cosa NON controlla:** Il prezzo inserito dal venditore in `rpc_list_car_for_sale` (possibile passaggio illegale di soldi tra account/multi-account).
- **Gravità Imbroglio:** 🟠 **ALTA** (riciclaggio e compravendita di valuta in-game tra giocatori reali).

### 6.2 Creazione Holding, Consorzi & Donazioni
- **Come si muove oggi:** `rpc_create_holding`, `rpc_create_consorzio`, `rpc_contribute_holding_treasury`, `rpc_contribute_consorzio`, `rpc_donate_to_alliance`.
- **Cosa controllano le RPC (`52_*`, `54_*`, `58_*`):**
  - Controllano l'autenticazione, la membership nel gruppo e la liquidità autoritativa su `companies.cash`.
  - Validano il segno degli importi (`p_amount > 0` e `p_amount <= 100.000.000 €`).
  - Rate-limit a 20 chiamate/minuto.
  - Scalano `companies.cash` e incrementano la tesoreria di gruppo.
- **Gravità Imbroglio:** 🟡 **MEDIA**. I fondi non possono essere creati dal nulla nelle ultime versioni delle RPC.

### 6.3 Quotazione IPO & Compravendita Azioni Giocatori
- **Come si muove oggi:** `p2p-market.js` (`listCompanyIPO`, `buyCompanyShares`, `sellCompanyShares`) -> RPC `rpc_list_company_ipo`, `rpc_buy_company_shares`, `rpc_sell_company_shares`.
- **Cosa controllano le RPC (`52_*`, `57_fix_ipo_reputation_source_of_truth.sql`):**
  - `rpc_list_company_ipo`: richiede reputazione minima >= 4.0 verificata su `companies.reputation` e tassa di quotazione 50.000 € detratta da `companies.cash`.
  - `rpc_buy_company_shares`: lock ordinato su buyer ed emittente, verifica disponibilità azioni e fondi, accredita il totale all'emittente e aggiorna la tabella `share_holdings`.
  - `rpc_daily_dividends` (`64_dividendi_giornalieri_idempotenti.sql`): calcola la quota del 10% sui ricavi e trasferisce i dividendi scalando dall'emittente agli azionisti.
  - **Cosa NON controlla:** La base di calcolo dei ricavi in `rpc_daily_dividends` legge ancora `game_saves.game_state.weeklyEarnings` (dato client-authoritative).
- **Gravità Imbroglio:** 🟠 **ALTA** (un emittente può falsificare i profitti nel save per distribuire o gonfiare dividendi a complici).

### 6.4 Ispezioni GdF & Don Carmine
- **Come si muove oggi:** `rpc_gdf_inspection_check` / `rpc_pay_don_carmine`. Scalano cassa direttamente da `companies.cash`.
- **Gravità Imbroglio:** 🟢 **BASSA**.

---

## 7. Aste Giudiziarie (Judicial Auctions)

### 7.1 Piazzamento Offerta (Bid)
- **Come si muove oggi:** `auctions.js` (`auctionsPlaceBid`) -> RPC `rpc_place_auction_bid` (`62_aste_ciclo_di_vita.sql`).
- **Cosa controlla la RPC:**
  - Verifica che l'asta sia `open` e non scaduta.
  - Verifica che l'offerta superi `min_bid`, sia maggiore della top bid attuale e non superi il tetto massimo di 100.000.000 €.
  - **Impegno fondi reale**: Calcola `v_impegnato` (somma di tutte le offerte attive su altre aste aperte) e verifica che `cash >= v_impegnato + v_amount`.
  - Rate-limit a 1 offerta ogni 10 secondi per utente/asta e anti-cheat flag per sbalzi anomali.
- **Gravità Imbroglio:** 🟢 **MOLTO PROTETTA / ROBUSTA**.

### 7.2 Risoluzione Asta & Riscatto Lotto (Claim)
- **Come si muove oggi:** Chiusura automatica da cron (`_process_judicial_auctions` -> `rpc_resolve_auction`); riscatto premi da giocatore tramite `rpc_claim_auction`.
- **Cosa controllano le RPC (`62_aste_ciclo_di_vita.sql`):**
  - `rpc_resolve_auction`: Eseguibile solo dal sistema (permessi revocati ad authenticated). Assegna la vittoria al miglior offerente che ha *davvero* i fondi in cassa (`FOR UPDATE`), scalando i soldi immediatamente. Se non coperto, scende all'offerta successiva.
  - `rpc_claim_auction`: Verifica che `claimed_at IS NULL` con lock atomico (impossibile doppio riscatto). Accredita i contanti dei container direttamente sul DB (`companies.cash`).
- **Gravità Imbroglio:** 🟢 **SICURA**. L'unico punto debole residuo è che il veicolo viene iniettato nel garage client dal payload di risposta.

---

## 8. Finanza Aziendale, Prestiti & Immobiliare

### 8.1 Prestiti Bancari (Take Loan & Repay Loan)
- **Come si muove oggi:** `ServerState.takeLoan` / `repayLoan` -> RPC `rpc_take_loan` / `rpc_repay_loan`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`, blindata in `49_lockdown_critical_cash_rpcs_scaffold.sql`):**
  - Massimo 3 prestiti simultanei per azienda.
  - **Credit Score Server-Authoritative**: Ricalcola il punteggio di credito dell'azienda da `companies.reputation`, `companies.cash` e storico debiti su `company_loans`.
  - Calcola il fido massimo consentito (da 100.000 € a 5.000.000 €) e rifiuta se `debito_attuale + richiesto > fido`.
  - `rpc_repay_loan` verifica fondi, scala `companies.cash` e cancella/aggiorna il prestito.
  - **Cosa NON controlla:** Non impedisce l'abbandono del debito se il giocatore non effettua più il login (mitigato da `rpc_collect_daily_costs`).
- **Gravità Imbroglio:** 🟢 **SICURA / ROBUSTA**.

### 8.2 Investimenti Aziendali (HQ Upgrades & Licensing)
- **Come si muove oggi:** `ServerState.buyInvestment` -> RPC `rpc_buy_investment`; `ServerState.unlockRegion` -> RPC `rpc_unlock_region`.
- **Cosa controlla la RPC (`02_mmo_rpcs_extension.sql`):**
  - Verifica fondi `cash >= v_price` e duplicati via vincolo `UNIQUE(company_id, inv_id)`.
  - Scala il prezzo da `companies.cash`.
- **Gravità Imbroglio:** 🟢 **BASSA**.

### 8.3 Mercato Immobiliare (Real Estate) & Rendite
- **Come si muove oggi:** `ServerState.buyRealEstate` -> RPC `rpc_buy_real_estate` (`09_provinces_realestate_fuel.sql`).
- **Cosa controlla la RPC:**
  - Legge il prezzo dalla tabella autoritativa `real_estate_listings.cost` (non dal client!).
  - Verifica che l'azienda non possieda già l'immobile e abbia fondi sufficienti su `companies.cash`.
  - Inserisce la riga in `company_real_estate` e scala i soldi.
  - `rpc_credit_real_estate_rents`: riservata solo a `service_role` (cron), accredita gli affitti ogni 24h.
- **Gravità Imbroglio:** 🟢 **ECCELLENTE (Modello di riferimento)**.

### 8.4 Guerra delle Province & Influenza Territoriale
- **Come si muove oggi:** `ServerState.acquireProvince` -> RPC `rpc_acquire_province` (`09_provinces_realestate_fuel.sql`).
- **Cosa controlla la RPC:**
  - Lock pessimistico sulla provincia.
  - Controlla che l'offerta sia almeno il 120% del valore attuale (`v_offer >= current_value * 1.20`).
  - Scala `v_offer` dal compratore e accredita l'80% al vecchio proprietario.
  - **Cosa NON controlla:** La provenienza dei fondi usati per fare l'OPA (se l'utente ha gonfiato la cassa prima con `syncCash`).
- **Gravità Imbroglio:** 🟠 **ALTA** (altera il controllo territoriale globale MMO e le tasse di transito degli altri giocatori).

---

## 9. Infrastrutture di Rifornimento & Monopoli

### 9.1 Acquisto Depositi Carburante & Imposte
- **Come si muove oggi:** `infrastructure.js` (`_infraBuyDepot`) -> RPC `rpc_buy_fuel_depot` (`29_infrastructure_monopoly.sql`, `30_sql_patch.sql`).
- **Cosa controlla la RPC:**
  - Verifica prezzo fisso (2.500.000 €) e fondi `cash >= 2.500.000 €`.
  - Registra la proprietà in `fuel_depots`.
  - `rpc_set_fuel_markup`: imposta il sovrapprezzo (max 15%).
  - `rpc_pay_fuel_levy`: incasso delle tasse pagate dagli altri giocatori.
- **Gravità Imbroglio:** 🟡 **MEDIA**.

---

## 10. Crypto Market & Conti Offshore

### 10.1 Trading Criptovalute (AMM Pool)
- **Come si muove oggi:** `crypto.js` (`cryptoBuy`, `cryptoSell`) -> RPC `rpc_buy_crypto`, `rpc_sell_crypto` (`24_crypto_offshore.sql`). `CE_money.addebitatoDalServer` / `accreditatoDalServer` aggiornano il browser.
- **Cosa controlla la RPC:**
  - Modello AMM a prodotto costante ($x \cdot y = k$) gestito al 100% dal database.
  - In acquisto: verifica `cash >= v_eur_in`, scala `companies.cash`, aggiorna le riserve e assegna i token in `crypto_holdings`.
  - In vendita: verifica possesso token in `crypto_holdings`, calcola controvalore EUR post-slippage e commissione 0.5%, aggiorna AMM e accredita su `companies.cash`.
  - **Cosa NON controlla:** Nessun difetto critico logico; il sistema è interamente server-authoritative.
- **Gravità Imbroglio:** 🟢 **SICURA**.

### 10.2 Depositi & Prelievi Offshore (Riciclaggio)
- **Come si muove oggi:** `cryptoDepositOffshore` / `cryptoWithdrawOffshore` -> RPC `rpc_deposit_offshore`, `rpc_withdraw_offshore` (`24_crypto_offshore.sql`).
- **Cosa controlla la RPC:**
  - `deposit`: minimo 10.000 €, commissione 3%, scala `companies.cash`, accredita su `offshore_accounts`.
  - `withdraw`: verifica saldo offshore, calcola rischio sequestro GdF (8%-28%), applica eventuale penale 40%, scala offshore e accredita `companies.cash`.
- **Gravità Imbroglio:** 🟢 **SICURA**.

---

## 11. Token VTK & Mercato Interno

### 11.1 Emissione Token da Missioni & Spesa Negozio VTK
- **Come si muove oggi:** `claimQuestReward` -> RPC `rpc_award_mission_vtk` (`21_vtk_token.sql`); `vtkBuyShopItem` -> RPC `rpc_spend_vtk_shop_item` (`46_vtk_shop_purchase_scaffold.sql`).
- **Cosa controllano le RPC:**
  - `rpc_award_mission_vtk`: limite massimo di 500 VTK per ricompensa e tetto giornaliero di 2.000 VTK per azienda tracciato in `companies.daily_vtk_earned`.
  - `rpc_spend_vtk_shop_item`: catalogo prezzi VTK autoritativo su tabella DB; verifica saldo `vtk_balance >= item_cost` e scala atomicamente.
  - Ordini di borsa VTK (`rpc_place_vtk_sell_order`, `rpc_fill_vtk_order`, `rpc_cancel_vtk_order`): gestiscono l'order book e i saldi VTK/EUR in modo autoritativo.
- **Gravità Imbroglio:** 🟢 **SICURA / BEN PROTETTA**.

---

## 12. Appalti Turistici & Contratti B2B

### 12.1 Gare d'Appalto Turismo (Tourism Tenders)
- **Come si muove oggi:** `tourismSubmitBid` / `_tourismDailyTick` -> RPC `rpc_submit_tourism_bid`, `rpc_tourism_daily_tick` (`33_tourism_tenders.sql`).
- **Cosa controllano le RPC:**
  - Calcolo requisiti flotta (numero auto e tier) verificati sul DB `vehicles`.
  - Risoluzione bandi e accreditamento dei pagamenti giornalieri tramite RPC batch `rpc_tourism_daily_tick`.
  - Penale di recesso anticipato detratta da `companies.cash`.
- **Gravità Imbroglio:** 🟢 **SICURA**.

### 12.2 Contratti B2B Server & Contratti Locali
- **Come si muove oggi:**
  - B2B Server (`b2b.js`): `rpc_accept_b2b_contract`, `rpc_b2b_daily_tick`, `rpc_terminate_b2b_contract` (`19_b2b_contracts.sql`). Totalmente server-authoritative.
  - Contratti Locali legacy (`contracts.js`): usano `CE_money.spend` / `CE_money.earn` -> `rpc_sync_cash`.
- **Cosa NON controlla il flusso locale:** Nessuna verifica lato server sul valore del contratto o sulla durata.
- **Gravità Imbroglio:** 🟡 **MEDIA** (il sistema B2B locale permette iniezioni di cash via `syncCash`).

---

## 13. Shadow Ops (Guerra Clandestina tra Giocatori)

### 13.1 Attacchi e Difese Shadow
- **Come si muove oggi:** `black_ops.js` (`shadowExecuteOp`, `shadowUpgradeDefense`) -> RPC `rpc_execute_shadow_op`, `rpc_upgrade_shadow_defense` (`23_shadow_ops.sql`).
- **Cosa controlla la RPC:**
  - Verifica costo dell'operazione e scala `companies.cash` dell'attaccante.
  - Calcola probabilità di successo/fallimento server-side, infligge danni/stress alla flotta nemica o furto fondi (max 5% cassa bersaglio), registra i log in `shadow_ops_log`.
- **Gravità Imbroglio:** 🟢 **SICURA**.

---

## 14. Routine Giornaliera, Campagne, Eventi Story & Vittorio

### 14.1 Costi Giornalieri Aggregati & Campagne Marketing
- **Come si muove oggi:** `ServerState.collectDailyCosts` -> RPC `rpc_collect_daily_costs` (`02_mmo_rpcs_extension.sql`).
- **Cosa controlla la RPC:**
  - Raccoglie la campagna marketing attiva da `active_campaigns` e le rate dei prestiti da `company_loans`.
  - Scala il totale da `companies.cash` in un'unica operazione atomica senza mai scendere sotto zero.
- **Gravità Imbroglio:** 🟢 **SICURA**.

### 14.2 Utile Netto Giornaliero, Tasse & Dividendi NGP (Daily Engine)
- **Come si muove oggi:** `engine-daily.js` (`processDailyRoutines`) calcola ricavi corse, stipendi autisti, manutenzioni, tasse annuali e dividendi, e applica il delta finale con `CE_money.earn(income - expenses, 'daily_net_profit')` -> `rpc_sync_cash`.
- **Cosa controlla lato server:** Solo il delta cap di 60M € in `rpc_sync_cash`.
- **Cosa dovrebbe controllare:** L'intero ciclo di simulazione economica giornaliera dovrebbe avvenire sul server (o validare le componenti di ricavo/costo).
- **Gravità Imbroglio:** 🟠 **ALTA** (è il cuore dell'economia idle del gioco).

### 14.3 Usuraio Vittorio & Eventi Narrativi VIP
- **Come si muove oggi:** `vittorio.js` (`repayVittorio`, `flipVittorio`), `vip-clients.js` e `quests-data.js` usano `CE_money.spend` / `CE_money.earn` -> `rpc_sync_cash`.
- **Cosa controlla lato server:** Nessuna validazione specifica oltre a `rpc_sync_cash`.
- **Gravità Imbroglio:** 🟡 **MEDIA**.

---

## 15. Classifica Ordinata delle Priorità di Intervento

La tabella seguente ordina le aree da cui **conviene partire** per trasformare l'economia in un sistema interamente a prova di imbroglio, motivando la scelta in base all'impatto sul business, all'interazione tra giocatori (MMO) e alla facilità di implementazione.

| Priorità | Area / Azione | Vettore di Rischio Attuale | Perché partire da qui | Intervento Tecnico Necessario |
|:---:|---|---|---|---|
| **#1** | **Acquisto Driver Coins (IAP / Stripe)** | `rpc_add_driver_coins` invocabile da chiunque con token JWT autenticato | **Rischio economico reale / monetizzazione.** I DC rappresentano denaro vero. Se gli utenti possono coniarli gratis, il gioco non incassa. | Revocare `GRANT EXECUTE` da `authenticated`. Accreditare i coin esclusivamente tramite Supabase Edge Function collegata al webhook verificato di Stripe con chiave segreta. |
| **#2** | **Vendita Veicoli & Catalogo Prezzi** | `rpc_sell_vehicle` accetta qualsiasi prezzo dichiarato dal client fino a 25.000.000 €; `rpc_buy_vehicle` accetta il prezzo client | **Fabbrica istantanea di liquidità.** Comprare un'auto economica e rivenderla dichiarando 25M € dà soldi infiniti per dominare classifiche, OPA e mercato P2P. | Creare una tabella catalogo `vehicle_catalog(model_id, price)` su DB e calcolare acquisto e svalutazione veicoli solo lato server. |
| **#3** | **Tariffe e Compensi Corse (`start_trip` / `claim_trip_reward`)** | `rpc_start_trip` registra il `v_reward` calcolato dal browser senza verificarne la congruità | **Motore economico primario.** Il 90% del cash legittimo viene dalle corse. Se il compenso è forzabile dal client, chiunque può guadagnare miliardi in poche corse. | Definire la tabella delle tratte o formula server-side `km * tariffa_base * moltiplicatore_classe` calcolata all'avvio della corsa sul DB. |
| **#4** | **Transazioni P2P & Quotazioni IPO** | Dividendi azionari letti dal blob `game_saves` anziché da ricavi reali certificati; prezzi di listino P2P senza price-bands | **Contagio tra giocatori (Economia MMO).** Un cheater può iniettare milioni nell'economia di altri giocatori comprando auto a prezzi esorbitanti o distribuendo dividendi falsi. | Bloccare la lettura di `game_saves` per il calcolo dividendi e introdurre bande di prezzo massime (es. max ±50% del valore del veicolo) sul mercatino P2P. |
| **#5** | **Deprecazione Totale di `rpc_sync_cash` (Ledger Unificato)** | `rpc_sync_cash` permette salti arbitrari fino a 60M € per chiamata | **Chiusura della porta posteriore.** Finchè `syncCash` accetta numeri dal client, qualsiasi altra blindatura parziale ha un bypass. | Attivare `42_economy_ledger_scaffold.sql` con `rpc_earn`/`rpc_spend` parametrizzati da motivazione e collegati a un ledger append-only immutabile. |
| **#6** | **Routine Giornaliera & Vittorio / Eventi VIP** | I calcoli di fine giornata e le scelte delle quest viaggiano ancora in locale prima di sincronizzare | **Consolidamento finale.** Minore impatto competitivo rispetto alle OPA e al P2P, ma necessario per il single-player competitivo. | Migrare il calcolo del tick giornaliero dentro una RPC `rpc_daily_tick` o Edge Function. |

---

## 16. Conclusioni per la Decisione Strategica

- **Il lavoro svolto finora ha eliminato le perdite di dati e le divergenze:** I giocatori non perdono più acquisti o progressi al refresh.
- **La protezione attuale è "difesa del perimetro" (Rate-limits e tetti ai delta):** Blocca i crash e gli overflow massivi (es. stringhe da $10^{15}$), ma non impedisce a un utente esperto di accreditarsi decine di milioni restando sotto la soglia di 60M € a chiamata.
- **Strategia consigliata per Vlad:**
  1. Eseguire subito la **Priorità #1** (Blindatura Driver Coins / Stripe) e la **Priorità #2** (Catalogo prezzi flotta). Hanno un rapporto sforzo/beneficio altissimo (poche righe SQL, massimo impatto di sicurezza).
  2. Pianificare la migrazione completa a **Ledger Server-Authoritative** (Priorità #3-#5) solo quando la scala economica finale del gioco sarà congelata e definitiva.
