# SYSTEMS.md — Mappa completa di Chauffeur Empire

> Generato da un audit di sola lettura (9 agenti paralleli, uno per sottosistema + uno per l'intero
> layer SQL/RPC, ~70 file JS e 46 migration SQL letti per intero) su richiesta di Vlad, 9 agosto 2026.
> Obiettivo: sapere **cosa esiste**, **cosa è già stato verificato**, **cosa non lo è mai stato**, e
> **dove rischia di più** — PRIMA di continuare a correggere bug ad-hoc. Nessun codice è stato
> modificato per produrre questo documento.
>
> Compagno di questo file: `docs/QA_PLAN.md` (il piano di test eseguibile, con priorità e scenari).
> Se stai cercando "cosa correggere per primo", vedi la sezione **Nuovi bug trovati in questo giro**
> più sotto, oppure `docs/QA_PLAN.md` → "Zero-day: da fixare indipendentemente dai test".

## Legenda
- 🔴 rischio alto — cash/RPC non validato, mai auditato, o bug confermato
- 🟡 rischio medio — logica delicata ma pattern noto/parzialmente coperto
- 🟢 rischio basso — puro rendering o già corretto e verificato
- **Stato audit**: `✅ auditato` (bug-hunt umano+agente già passato) · `🌓 parziale` (solo un bug puntuale corretto, resto mai riletto) · `⬜ mai auditato`

## Dashboard esecutiva

| # | Sistema | File principali | Stato audit | Rischio | Nota in una riga |
|---|---|---|---|---|---|
| 1 | **Core/Boot/Save/Auth** | `engine.js`, `saveSystem.js`, `serverState.js`, `syncManager.js`, `auth.js`, `quests.js`, `tutorial.js`, `zero-to-hero.js`, `ui-landing.js` | ⬜ mai auditato | 🔴 | Percorso obbligato ad ogni login; `engine.js` ha 6+ scritture cash dirette mai mirrorate; New Game+ non sincronizza mai col server |
| 2 | **Economy/Finance** | `engine-daily.js`, `engine-finance.js`, `engine-store.js`, `engine-holding.js`, `crypto.js`, `infrastructure.js`, `ui-finance.js`, `ui-investments.js`, `ui-politics.js` | 🌓 parziale | 🔴 | `engine-finance.js` (stocks/short/prestiti/lobby) è interamente client-authoritative, mai auditato |
| 3 | **Garage/Fleet/Map** | `engine-fleet.js`, `showroom.js`, `ui-fleet.js`, `map*.js`, `vanity.js` | 🌓 parziale | 🔴 | `engine-fleet.js`: ~13 funzioni scrivono cash/DC senza RPC (riparazioni, carburante, upgrade, aste) |
| 4 | **Employees/Drivers** | `engine-drivers.js`, `driver_skills.js`, `ui-staff.js` | ⬜ mai auditato | 🔴 | Assunzione/licenziamento driver **bypassano** le RPC dedicate che esistono già; licenziare un driver `busy` non è bloccato |
| 5 | **Rides/Dispatch/VIP** | `engine-rides.js`, `engine-events.js`, `vip-clients.js`, `nemesis.js`, `black_ops.js` | 🌓 parziale | 🟡/🔴 | Corse/dispatch solidi (già auditati); `vip-clients.js` mai auditato, bug di danno su auto sbagliata trovato |
| 6 | **Contracts/Corporate/War/Auctions** | `contracts.js`, `tourism.js`, `b2b.js`, `war_room.js`, `hostile_takeover.js`, `auctions.js` | 🌓 parziale | 🔴 | Stessa famiglia di bug ("promessa &gt; posseduto, pagamento reale minore") su tourism/b2b/auctions |
| 7 | **P2P/Multiplayer/Alliances** | `p2p-market.js`, `p2p-render.js`, `alliances.js`, `vtk-market.js`, `global_events.js` | 🌓 parziale | 🔴 | **XSS confermato** su nomi giocatore/auto non sanitizzati; bug di stato cross-file su eventi globali |
| 8 | **UI shell/misc/HQ** | `ui-home.js` … `hq.js`, 27 file | 🌓 parziale | 🔴 | `hq.js`: costruzioni HQ interamente client-side con effetti moltiplicatori **permanenti** — nessuna RPC |
| 9 | **SQL/RPC layer (46 migration)** | tutto `*.sql` in root | 🌓 parziale (2 giri precedenti) | 🔴🔴 | **12 nuovi finding**, 3 dei quali critici e più gravi di quelli già noti (vedi sotto) |

---

## 1. Core / Boot / Save / Auth

### `engine.js` (2032 righe) 🔴 ⬜
Game loop, `gameState`, save/load, gran parte delle azioni di alto livello (investimenti, regioni, aste, contratti diamond, New Game+).
- 6+ scritture dirette `gameState.cash` **mai mirrorate col server**: `_resolveAuction` (rimborso bid), `_triggerVIPMidRideEvent`, `payFine`, `attackTerritory`, `sellInvestment`, `acceptDiamondContract`.
- **Bug concreto**: `newGamePlus`/`sellCompanyNGP` azzerano/impostano `gameState.cash` senza mai chiamare `ServerState.syncCash`. Poiché `auth.js` Fase 5 fa sempre vincere il valore server al prossimo login/refresh, un New Game+ può "tornare indietro" silenziosamente.
- Migrazione save legacy (righe 465-677) è debito perenne: ogni campo nuovo va aggiunto a mano.

### `saveSystem.js` (383 righe) 🟡 ⬜
Slot unico, upsert cloud debounced 4s, leaderboard, reset account. Infrastruttura di persistenza pura — nessuna nuova generazione di cash.

### `serverState.js` (650 righe) 🔴 ⬜
Layer RPC/Realtime centrale — **singolo punto di failure** per tutta l'architettura server-authoritative. `_onCompanyChange` applica il delta cash; `_ensureCompany()` auto-crea la company row al volo. Un bug qui si propaga a ogni azione con RPC nel gioco.

### `syncManager.js` (237 righe) 🟢 ⬜
Sync locale↔filesystem (power-user, opt-in). Bug di staleness: da quando il cloud è source-of-truth, `localStorage` si scrive solo al login → l'export può esportare uno snapshot congelato.

### `auth.js` (384 righe) 🔴 ⬜
`_mmoBootSequence` (6 fasi) — **eseguito ad ogni login/refresh di ogni giocatore**. Il guard "sim orfana" (Fase 4) è euristico (solo `_companyId`); se `companyId` è null da entrambe le parti non scatta. Fase 5 fa sempre vincere il cash server (coerente col bug New Game+ sopra).

### `quests.js` (104 righe) 🟡 ⬜
Pattern cash **corretto** (mirror immediato con `syncCash`) — modello di riferimento. Riconciliazione ottimistica VTK/DC senza retry automatico su fallimento RPC silenzioso.

### `tutorial.js`, `zero-to-hero.js`, `ui-landing.js` 🟢/🟡 ⬜
Onboarding/landing — basso rischio economico. `zero-to-hero.js` è il **primissimo funnel di ogni giocatore**: piccola superficie ma rischio business alto se rotto. `ui-landing.js`: rate-limit solo client-side (bypassabile), e la query classifica pubblica pre-login potrebbe esporre `cash` di tutti i giocatori se la RLS non lo impedisce (da verificare lato Supabase).

---

## 2. Economy / Finance / Crypto / Holding

### `engine-daily.js` (1168 righe) 🔴 🌓
Cuore del tick giornaliero — 17 scritture cash dirette, orchestrazione di ~15 sotto-sistemi in un solo tick sequenziale. Bug-hunt precedente ha corretto 3 problemi; il resto non è stato riletto in modo esaustivo da allora.

### `engine-finance.js` (465 righe) 🔴 ⬜
**Interamente client-authoritative**: `buyStocks`, `shortSell`, `takeLoan`, `donateToLobby`, `acquireVentureStake`, `buyLifestyleAsset`, `placeBrokerInvestment` — 9 funzioni player-facing, zero RPC, zero sync server. Mai auditato prima.

### `engine-store.js` (214 righe) 🟡 ⬜
Booster Driver Coins spesi **interamente in locale**, mentre `ui-store.js`/`vanity.js` per la stessa valuta usano correttamente l'RPC — asimmetria concreta, potenziale godmode DC via console.

### `engine-holding.js` (126 righe) 🟡 ⬜
Possibile ciclo auto-riferito nell'IPO NPC fallback (prezzo azione calcolato su cash corrente, poi incassa dagli NPC sullo stesso cash) — da verificare se la versione P2P reale la sovrascrive sempre.

### `crypto.js`, `infrastructure.js` 🟡/🟢 ✅
Già corretti nel giro "PR round2" (doppia deduzione), pattern guard `!ServerState.isReady()` verificato coerente in ogni punto.

### `ui-finance.js`, `ui-investments.js`, `ui-politics.js` 🟢/🟡 ⬜/✅
Puro rendering, azioni delegate. `ui-investments.js` già corretto (linea di credito). Rischio residuo: disallineamento display/motore se `engine-finance.js` cambia senza aggiornare i pannelli in coppia.

---

## 3. Garage / Fleet / Map

### `engine-fleet.js` (516 righe) 🔴 ⬜
**Il file più esteso di questo pattern nel gioco**: ~13 funzioni (`repairVehicle`, `instantRepairDC`, `buyFuelForDepot`, `emergencyRefuel`, `upgradeFuelDepot`, `buyTiresForDepot`, `buyCARUpgrade`, `buyMaintenanceContract`, `returnToHub`, `buyHub`, `sellHub`, `buyPrototypeCar`, `buyNpcCar`, `bidOnAuction`, `applyVehicleSkin`) scrivono `gameState.cash`/`driverCoins` **direttamente, senza RPC**. Poiché `saveGame()` è puro localStorage, questi importi probabilmente non raggiungono mai la colonna server-authoritative — stesso bug già fixato per l'acquisto auto in showroom, qui su superficie enormemente più ampia.

### `showroom.js` (736 righe) 🟢 ✅
Pattern RPC corretto e commentato — **modello di riferimento** per correggere `engine-fleet.js`.

### `ui-fleet.js` (419 righe) 🟡 ⬜
Prezzo riparazione mostrato in tabella non applica gli sconti che `repairVehicle` applica davvero — mismatch UI/motore.

### `map.js` + `ui-map-utils.js` 🟡 ⬜ — **bug cross-file confermato**
`ui-map-utils.js` dichiara `let _hqMarker` (non `var`/`window.X`); `map.js::_destroyMap()` legge `window._hqMarker`, che quindi è sempre `undefined` → il marker HQ non viene mai rimosso quando la mappa viene distrutta (chiamato realmente da `dispatcher.js`/`war_room.js`). Stesso pattern del bug storico `_activeTab`.

### `map-router.js`, `map-garage.js`, `map-visual.js` 🟢/🟡 ⬜
Logica pura. `map-router.js`: divisione per zero non guardata se `ride.duration===0`. `map-visual.js`: il RAF loop non si ferma mai anche a mappa chiusa (overhead perenne, non un bug funzionale).

### `vanity.js` (180 righe) 🔴 ⬜ — **conferma il pattern "cosmetici gratis" richiesto da Vlad**
`_spend()` non awaita `ServerState.spendDriverCoins` prima di concedere il cosmetico; se l'RPC fallisce, il cosmetico resta posseduto per sempre mentre il server non ha mai scalato il saldo.

---

## 4. Employees / Drivers

### `engine-drivers.js` (194 righe) 🔴 ⬜
Assunzione/licenziamento/bonus/sciopero/accademia **bypassano completamente** le RPC dedicate (`rpc_hire_driver`/`rpc_fire_driver` esistono ma sono usate solo per lo staff d'ufficio). Bug concreto: `fireDriver` non controlla `status==='busy'` — si può licenziare un driver a metà corsa, lasciando riferimenti orfani in `activeRides`.

### `driver_skills.js` (337 righe) 🟡 ⬜
Albero skill puramente client-side (mai risincronizzato dal server — quindi immune al bug "overwrite Realtime", ma anche senza alcuna validazione anti-cheat). `driverPermadeathRoll` ha una finestra di 5s (`setTimeout`) in cui il driver è `dead` ma ancora referenziabile.

### `ui-staff.js` (617 righe) 🟡/🔴 ⬜
Mescola HR ufficio (RPC corretta per hire, **nessuna RPC per `fireStaff`**) e acquisto auto (RPC corretta, pattern guard presente). Mercato Reclutamento driver non applica il controllo capacità staff che invece il bottone HR ufficio applica.

---

## 5. Rides / Dispatch / VIP / Rivali

### `engine-rides.js` (930 righe) 🟡 ✅
Già corretto (doppia penalità incidente, guard prestige). Nessun pattern residuo trovato in questa rilettura completa.

### `engine-events.js` (387 righe) 🟡 ⬜
Possibile accumulo di multe ZTL ripetute sulla stessa corsa lunga (nessun flag "già multata") — da confermare se by-design col game designer.

### `engine-rivals.js` 🟢 ⬜ — AI NPC isolata, nessuna scrittura cash reale.

### `dispatcher.js`, `ui-dispatch.js` 🟢 ⬜ — puro routing/UI, nessun rischio economico.

### `vip-buffs.js` 🟢 ⬜ — motore buff semplice e corretto.

### `vip-clients.js` (749 righe) 🔴 ⬜ — **nuovo bug trovato, stessa classe del bug Vetri Oscurati già corretto**
`_vipCompleteGolden`/`_vipCompleteErede` applicano danno/riparazione a `ride.carId` invece che al veicolo realmente usato per la corsa (la ride VIP non vincola mai `driverId`/`vehicleRequired` al veicolo scelto in accettazione — può finire assegnata a un'auto diversa via dispatch automatico).

### `nemesis.js`, `black_ops.js` 🔴 ⬜ (falle note, vedi sezione SQL)

---

## 6. Contracts / Corporate / War / Auctions

### `contracts.js` (519 righe) 🔴 🌓
**Interamente client-side, zero RPC** — l'unico dei 6 sistemi del gruppo senza validazione server. Il bug di duplicazione denaro è corretto, ma la cassa gonfiata via `gameState.corporateContracts` editato a mano sopravviverebbe comunque al prossimo `rpc_sync_cash` (che fa un SET assoluto, non valida nulla — vedi finding SQL A).

### `tourism.js` (501 righe) 🔴 🌓 — **nuovo finding**
`rpc_submit_tourism_bid`: `v_qualifying_vehicles` dichiarato dal client, mai verificato contro la flotta reale (40% dello score falsificabile). Pledge mai messo in escrow al momento del bid — si vince pagando meno del promesso (stessa famiglia della falla nota su `rpc_resolve_auction`).

### `b2b.js` (448 righe) 🔴 🌓 — **nuovo finding**
`rpc_accept_b2b_contract` valida solo la *lunghezza* dell'array veicoli, non proprietà/tier reali — un client alterato ottiene il contratto e il payout con veicoli fittizi.

### `war_room.js` (495 righe) 🟢 ⬜
`rpc_acquire_province` ben implementata (validazioni, `FOR UPDATE`, atomica) — buon esempio. Rischio solo su robustezza UI (dipendenza da GeoJSON esterno non cacheable).

### `hostile_takeover.js` (157 righe) 🟡 ⬜
`rpc_opa_buyback` ben implementata. Il vero rischio è `rpc_pay_majority_dividend` (falla nota, chiamata fire-and-forget da `engine-rides.js`).

### `auctions.js` (370 righe) 🔴 ✅ (falla confermata, non nuova)
Conferma via lettura SQL diretta: `rpc_resolve_auction` non riserva mai il cash al bid, solo al `LEAST(cash, win_bid)` in risoluzione — si vince quasi gratis spendendo il cash altrove nel frattempo.

---

## 7. P2P / Multiplayer / Alliances / Global

### `p2p-market.js` (527 righe) 🟡 🌓
Pattern cash sicuro ovunque. Funzioni di fetch dichiarate senza guard `typeof` (fragile a riordini script). Realtime INSERT senza dedup per id → possibile doppia visualizzazione temporanea di un'inserzione.

### `p2p-render.js` (476 righe) 🔴 ⬜ — **XSS confermato**
`car.name`/`l.seller_name` stampati **senza** `CE_Sec.escHtml()` nella sezione Mercato (ogni altra sezione dello stesso file esegue l'escape correttamente). `seller_name` è testo libero del giocatore — eseguibile nel browser di ogni altro giocatore che apre la tab.

### `alliances.js` (377 righe) 🟡 ✅
Già corretto (doppia deduzione, leak chat volontario). Leak residuo minore: `_unsubscribeChat` non chiamato se un membro viene **espulso** (solo su leave/disband volontari).

### `vtk-market.js` (421 righe) 🔴 🌓 — **XSS confermato + inconsistenza**
Stesso pattern XSS di `p2p-render.js` su `seller_name` nel Mercato VTK. In più, 3 funzioni (`vtkPlaceSellOrder`/`Fill`/`Cancel`) mutano `vtkBalance` locale **senza** il guard che invece `vtkBuyShopItem` usa correttamente nello stesso file.

### `global_events.js` (201 righe) 🔴 ⬜ — **nuovo bug di stato concatenato**
1. Gli effetti tip/velocità di un evento globale si sincronizzano **solo se l'Hub è aperto** (return anticipato se il DOM non c'è) — un giocatore che non visita mai l'Hub non li riceve mai, mentre `wearMult` (letto altrove) funziona sempre.
2. `gameState.activeDynamicEvent` non viene **mai azzerato** a fine evento globale → il generatore di eventi dinamici locali (`engine-events.js`) resta bloccato **permanentemente** dopo il primo evento globale visto.

### `world-feed.js` 🟢 ✅ (verificato: doppia subscription con `ui-realestate.js` è ridondanza di rete, non un bug di doppio stato)

---

## 8. UI shell / misc / meta / HQ

Rischio concentrato in 2 file, il resto è prevalentemente rendering a basso impatto:

### `hq.js` (400 righe) 🔴 ⬜ — **priorità massima del gruppo**
`hqUpgradeRoom` scala `gameState.cash` **direttamente, zero RPC**, a differenza di `doBuyRealEstate`/`doAcquireProvince` (stesso "tier" di sistema, entrambi RPC-based). Gli effetti HQ sono moltiplicatori **globali e permanenti** (`allEarningsMult`, `tipMult`, `salaryCostMult`, `driverXpMult`, ecc.) — un exploit qui non ruba un importo una-tantum ma compone un vantaggio su tutta l'economia futura del giocatore.

### `daily-orders.js` (188 righe) 🔴 ⬜ — **bug auto-documentato nel codice, mai risolto**
Race condition nota (commentata dagli sviluppatori stessi): il claim locale marca l'ordine riscosso **prima** di conoscere l'esito della RPC Driver Coins; un evento Realtime che arriva nel mezzo può azzerare il premio mentre l'ordine resta "riscosso" per sempre.

### `ui-store.js` (449 righe) 🔴 ⬜
Pattern "optimistic update poi RPC" ripetuto in ~7 handler (Driver Coins) senza rollback coerente sui fallimenti.

### `vittorio.js`, `ui-ops.js` 🟡 ⬜
Pattern "mirror fire-and-forget" (`syncCash`/DC non riletto dal risultato RPC) — drift silenzioso possibile.

### `weather_real.js` 🟡 ⬜
Mappa regione→provincia copre solo 5 regioni; HQ in città non mappate (Firenze/Napoli/Venezia esistono come HQ validi) ricadono sempre sul meteo di Roma. Possibile riferimento a un campo `gameState.hq.region` legacy post-migrazione multi-città (da verificare).

### Tutto il resto (`ui-home.js`, `ui-ranking.js`, `ui-marketing.js`, `ui-emails.js`, `ui-legal.js`, `ui-career.js`, `ui-market.js`, `ui-realestate.js` ✅ RPC corretta, `ui-sidebar.js`, `ui-help.js`, `ui-hub.js`, `ui-lifestyle.js`, `premium-ui.js`, `mobile_dispatcher.js`, `push-notifications.js` ✅ difensivo, `design-system.js`, `security.js` ✅, `motion.js`, `objective-tracker.js`, `hq-visual.js`, `hq-data.js`) 🟢/🟡
Prevalentemente rendering con azioni delegate. Rischio principale: soglie/formule duplicate rispetto al motore (pattern "numero mostrato ≠ applicato" già corretto 6 volte altrove — vigilanza continua richiesta, non un sistema da testare una tantum).

---

## 9. SQL / RPC layer — 46 migration, mappa completa

Due giri di audit precedenti avevano già trovato e scaffoldato (⚠️ **non ancora applicate al DB prod**) 11 vulnerabilità: `_add_player_cash`/`_get_player_cash`, `rpc_pay_majority_dividend`, `rpc_claim_daily_reward`, `rpc_start_trip`/`rpc_claim_trip_reward`, `rpc_resolve_auction`, `rpc_execute_shadow_op`, `rpc_nemesis_fund_rival`, `rpc_upgrade_shadow_defense`, `rpc_dampen_tension`, `rpc_sell_crypto`.

Questo terzo giro ha trovato **12 finding nuovi**, tre dei quali sono **più gravi** di qualunque cosa trovata finora:

### 🔴🔴 CRITICI — cash illimitato/arbitrario, non ancora scaffoldati
- **A. `rpc_sync_cash`** (`10_sync_cash.sql`) — fa un `SET cash = v_cash` **assoluto**, `v_cash` è un bigint scelto interamente dal client, **zero validazione**. Unico argine: il vincolo `CHECK (cash >= 0)` sulla colonna. Chiamata reale da `serverState.js` (`syncCash`, usata da `zero-to-hero.js`/`quests.js`/tutto il resto del gioco). Exploit: `supabase.rpc('rpc_sync_cash', {v_cash: 999999999999})` da devtools.
- **B. `rpc_sell_vehicle`** (`09_provinces_realestate_fuel.sql`) — `v_price` dal client, **nemmeno un check `>= 0`**. Vendi l'auto più economica della flotta dichiarando un prezzo qualsiasi.
- **C. `rpc_take_loan`** (`02_mmo_rpcs_extension.sql`) — nessun tetto sul capitale (`v_principal`), solo "max 3 prestiti concorrenti". Credito istantaneo praticamente illimitato.

### 🔴 ALTI — nuovi, non scaffoldati
- **F. Famiglia "Driver Coins negativi"** — 6 RPC (`rpc_upgrade_offline_limit`, `rpc_buy_auto_rest`, `rpc_buy_energy_refill`, `rpc_buy_fleet_repair`, `rpc_buy_vip_contact`, `rpc_buy_hr_automation`) validano solo `driver_coins < costo`, quindi un costo **negativo** passa sempre il check e minta DC.
- **G. Pattern sistemico "il server si fida del prezzo del client"** — ~10 RPC (`rpc_buy_vehicle`, `rpc_hire_driver`, `rpc_buy_investment`, `rpc_buy_vehicle_upgrade`, `rpc_toggle_telepass`, `rpc_refuel_vehicle`, `rpc_repair_vehicle`, `rpc_rest_ceo`, `rpc_start_marketing_campaign`, `rpc_unlock_region`) validano solo `prezzo >= 0`, **mai confrontato con un listino server**. Compra un'auto a €1, assumi un autista ULTRA a stipendio €0.
- **K. `rpc_vote_server_decree`** (`22_server_decrees.sql`) — il commento nel file stesso ammette *"il server si fida del client per i lobbying points"*. Un giocatore può far approvare **istantaneamente qualunque decreto globale**, alterando le regole economiche per **tutti** i giocatori del server con una singola chiamata.
- **H. `rpc_submit_tourism_bid`** — vedi sezione 6.

### 🟡 MEDI — nuovi
- **D. `rpc_daily_dividends`** — nessun gate "una volta al giorno", drenaggio ripetibile (nessun call-site client oggi, rischio pratico basso ma alto via API diretta).
- **E. `rpc_add_province_influence`** — `v_amount` senza tetto massimo, bypassa il grind previsto.
- **J. `rpc_spawn_judicial_auction`** — GRANT troppo ampio (pensata per cron, chiamabile da chiunque); combinata con la falla nota #5 permette di creare E risolvere la propria asta truccata.
- **L. `rpc_update_hq_status`** — punteggio leaderboard pubblico HQ è client-supplied, non derivato da dati reali (vanity-cheat).

### 🔧 Bug funzionale (non sicurezza)
- **I.** `rpc_add_driver_coins(integer)` — un fix di ambiguità overload (`18_`) è stato **annullato** da migration successive (`41_`/`43_`) che ricreano lo stesso overload ambiguo.

### ⚠️ Da verificare con Vlad direttamente
Il commento in `38_security_hardening.sql` afferma che trigger `validate_*` cappano `cash`/`liquid_assets` a 500M — **nessun trigger simile esiste in nessuno dei 46 file del repo**. O è applicato manualmente su Supabase (mai committato) o il claim è impreciso — cambia la severità pratica dei finding A/B/C sopra.

### RPC verificate CORRETTE (buoni esempi da imitare)
`rpc_place_auction_bid`, `rpc_list_car_for_sale`, `rpc_acquire_province`, `rpc_opa_buyback`, `rpc_activate_alliance_perk`, `rpc_add_driver_coins` (rate-limited), `rpc_spend_vtk_shop_item`, `rpc_process_offline_gains`, `rpc_due_push_subscriptions` (REVOKE corretto da client).

---

## Nuovi bug trovati in questo giro (riepilogo cross-sistema)

Bug **funzionali** concreti (non solo debito di sicurezza) trovati durante questo audit, non presenti in nessun bug-hunt precedente:

1. **`vip-clients.js`** — Golden Boy/Erede applicano danno/riparazione all'auto sbagliata (stessa classe del bug Vetri Oscurati già corretto).
2. **`map.js`/`ui-map-utils.js`** — `_hqMarker` è `let` invece di `window.X`, il marker HQ non viene mai ripulito da `_destroyMap()`.
3. **`engine-drivers.js`** — `fireDriver` non blocca il licenziamento di un driver a metà corsa.
4. **`global_events.js`** — eventi dinamici locali bloccati permanentemente dopo il primo evento globale visto; effetti tip/velocità non applicati se l'Hub non è mai stato aperto.
5. **`daily-orders.js`** — race auto-documentata nel codice: reward DC può perdersi mentre l'ordine resta "riscosso".
6. **`p2p-render.js` / `vtk-market.js`** — **XSS**: nomi giocatore/auto non sanitizzati nel rendering dei mercati P2P/VTK.
7. **`engine.js`** — New Game+ non sincronizza il nuovo cash col server; un relogin può farlo tornare al valore precedente.
8. **`engine-fleet.js`** — ~13 funzioni di spesa cash/DC senza RPC (la stessa classe di bug già fixata per l'acquisto auto, qui su superficie molto più ampia).
9. **`hq.js`** — costruzioni HQ interamente client-side con effetti economici globali permanenti.
10. **12 finding SQL nuovi** (sezione 9), 3 critici.

Questi sono segnalazioni, non fix — nessuno di questi è stato corretto in questo giro (mandato esplicito: solo lettura/mappatura).
