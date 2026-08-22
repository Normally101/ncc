# Registro delle azioni — un'azione, una funzione

> **Regola 4 del criterio uniforme.** Una stessa azione di gioco deve avere **una sola**
> implementazione. Quando ne esistono due, prima o poi divergono in silenzio: prezzi diversi,
> sconti diversi, e una che sincronizza col server mentre l'altra no. È già successo.
>
> Prima di aggiungere una funzione che compra, vende, ripara, paga o premia: **cerca qui**.
> Se l'azione c'è già, estendi quella. Se la aggiungi, scrivila qui.

Origine: analisi unificata completa dei 93 file del codebase (nucleo, moduli, interfacce).

---

## Azioni consolidate (fatto)

| Azione | Funzione canonica | Ritirate | Note |
|---|---|---|---|
| Riparare la carrozzeria | `payToRepairCar` (engine.js) | ~~`repairVehicle`~~ (engine-fleet.js) | Prezzo da `repairCostFor()`, **fonte unica**. Le interfacce non devono ricopiare la formula |
| Muovere denaro / DC / reputazione | `CE_money.*` (money.js) | `gameState.cash -=` diretto, `_addCash` | Sorvegliato da `test/guardrail/una-sola-porta.test.js` |
| Effetti HQ | `hqAllEffects` (hq.js) | ~~`hqGetEffect`~~ | HQ dietro interruttore spento |
| Schermate War Room / Province | `renderTabWarRoom` (war_room.js), `renderTabProvinces` (ui-ops.js) | ~~`window.renderTabProvinces = renderTabWarRoom`~~ | Nomi distinti, nessuna collisione di caricamento |
| Tracciato rotte attive e traffico | `_updateActiveRouteLines` (map.js) | ~~`_updateActiveRouteLinesColored`~~ (ui-map-utils.js) | Supporto completo al traffico integrato in map.js |

---

## Azioni da consolidare (aperte)

Ordinate per gravità. Ognuna è un task.

### Denaro non sincronizzato — 19 azioni confermate
`engine-store.js` (12 funzioni DC), `engine-holding.js`, `engine-fleet.js`, `engine-drivers.js`,
`engine-finance.js`, `contracts.js`, `daily-orders.js`. Vedi la lista `ECCEZIONI` in
`test/guardrail/una-sola-porta.test.js`: è la lista di lavoro, e **può solo accorciarsi**.

### Doppioni con prezzi divergenti

| Azione | Implementazioni | Problema |
|---|---|---|
| Rifornire carburante | 6 (`buyStandardFuel`†, `buyBlackMarketFuel`†, `buyFuelForDepot`, `emergencyRefuel`, `fuelBoostDC`, item VTK) | 3 orfane; le vive non sincronizzano |
| Azzerare stress autista | 6 | **5 prezzi diversi**: lo stesso effetto costa 2 DC o 25 DC |
| Ripristinare energia CEO | 5 | La sola cablata (`energyBoostDC`) è l'unica senza RPC → **energia gratis** |
| Comprare un veicolo | 6 | `buyPrototypeCar` e `buyNpcCar` non chiamano il server |
| Premiare `{cash, dc, rep, vtk}` | 5 | Solo `claimQuestReward` è completo; `claimDailyOrder` ha due bug |

† orfana

### Sistemi paralleli interi, entrambi vivi

| Sistema | Locale (senza server) | Server | Dove si scontrano |
|---|---|---|---|
| Holding | `engine-holding.js` | `p2p-market.js` | Stessa tab `ui-investments.js` |
| Consorzio | `alliances.js` | `p2p-render.js` | Tabelle DB diverse, stesso nome |
| Azioni societarie / IPO | `engine-holding.js` | `p2p-market.js` | **Due scrittori per `gameState.companyIPO`** |

---

## Note sulle discrepanze tra registri precedenti

- **`hqOpenBuildModal` vs `hqOpenBuildModalSlot`**: il registro iniziale segnalava collisione tra `hq-visual.js` e `hq.js`. La verifica sul codice reale dimostra che `hqOpenBuildModal` è stata sostituita da `hqOpenBuildModalSlot` (in `hq-visual.js:87`) e la vecchia variante da `_hqBuildFromList` (in `hq.js:373`), risolvendo la collisione.
- **`listCarForSale`**: `p2p-market.js:60` sovrascrive `engine-fleet.js:414` (il registro iniziale riportava la vecchia riga 455; la verifica su file aggiornato conferma riga 414 come in `AZIONI-moduli.md`).
- **`buyHRAutomation`**: presente sia come UI handler in `ui-ops.js:218` sia come RPC helper in `serverState.js:534`.
- **`renderTabProvinces`**: separato da `renderTabWarRoom` in `war_room.js:240`; `ui-ops.js:88` e `:264` rimangono la sola schermata province.

---

## Tabella unificata delle funzioni

| Funzione | Definizione | Chiamata da (data-ce-act) | Collisioni / Doppioni | Movimento denaro |
|---|---|---|---|---|
| `_academySelectDriver` | `ui-map-utils.js:221` | `_academySelectDriver` (`ui-map-utils.js`) | nessuno | no |
| `_addCash` | `engine.js:996` | nessuna | nessuno | CE_money (`earn`) / diretto (`_addCash =, gameState.cash +=`) |
| `_addChecksum` | `syncManager.js:22` | nessuna | nessuno | no |
| `_aErr` | `auctions.js:15` | nessuna | nessuno | no |
| `_alChat` | `alliances.js:362` | `_alChat` (`alliances.js`) | nessuno | no |
| `_alCreate` | `alliances.js:292` | `_alCreate` (`alliances.js`) | nessuno | CE_money (`spend, earn`) |
| `_alDisband` | `alliances.js:334` | `_alDisband` (`alliances.js`) | nessuno | no |
| `_alDonate` | `alliances.js:345` | `_alDonate` (`alliances.js`) | nessuno | CE_money (`addebitatoDalServer`) |
| `_alJoin` | `alliances.js:315` | `_alJoin` (`alliances.js`) | nessuno | no |
| `_alKick` | `alliances.js:371` | `_alKick` (`alliances.js`) | nessuno | no |
| `_alLeave` | `alliances.js:323` | `_alLeave` (`alliances.js`) | nessuno | no |
| `_allyActivePerk` | `alliances.js:44` | nessuna | nessuno | no |
| `_allyPerkMult` | `alliances.js:29` | nessuna | nessuno | no |
| `_allyRefreshPerk` | `alliances.js:38` | nessuna | nessuno | no |
| `_alPerk` | `alliances.js:383` | `_alPerk` (`alliances.js`) | nessuno | no |
| `_alSetRole` | `alliances.js:377` | `_alSetRole` (`alliances.js`) | nessuno | no |
| `_animateLpCounters` | `ui-landing.js:412` | nessuna | nessuno | no |
| `_appendNewsTicker` | `ui-realestate.js:6` | nessuna | nessuno | no |
| `_applyBivioChoice` | `ui-career.js:575` | `_applyBivioChoice` (`ui-career.js`) | nessuno | no |
| `_applyBrand` | `vanity.js:38` | nessuna | nessuno | no |
| `_applyBrandColor` | `engine.js:356` | nessuna | nessuno | no |
| `_applyBuff` | `vip-buffs.js:21` | nessuna | nessuno | no |
| `_applyEmailTemplate` | `engine.js:94` | nessuna | nessuno | no |
| `_applyGlobalEventBanner` | `global_events.js:108` | nessuna | nessuno | no |
| `_applyLangToDOM` | `lang.js:165` | nessuna | nessuno | no |
| `_applyMarketingCampaign` | `engine.js:134` | `_applyMarketingCampaign` (`ui-marketing.js`) | nessuno | no |
| `_applyMarketingCampaign` | `engine.js:179` | `_applyMarketingCampaign` (`ui-marketing.js`) | nessuno | no |
| `_applyRealWeather` | `weather_real.js:40` | nessuna | nessuno | no |
| `_applyRowChange` | `serverState.js:185` | nessuna | nessuno | no |
| `_applyWeatherOverlay` | `engine-daily.js:134` | nessuna | nessuno | no |
| `_assertReady` | `serverState.js:561` | nessuna | nessuno | no |
| `_auctionsSubscribeRealtime` | `auctions.js:437` | nessuna | nessuno | no |
| `_authForgotPassword` | `ui-landing.js:520` | nessuna | nessuno | no |
| `_authLogin` | `ui-landing.js:470` | `_authLogin` (`ui-landing.js`) | nessuno | no |
| `_authSignup` | `ui-landing.js:491` | `_authSignup` (`ui-landing.js`) | nessuno | no |
| `_autoClaimReadyTrips` | `serverState.js:249` | nessuna | nessuno | no |
| `_autoDalLotto` | `auctions.js:178` | nessuna | nessuno | no |
| `_availableDB` | `daily-orders.js:60` | nessuna | nessuno | no |
| `_avvisa` | `money.js:24` | nessuna | nessuno | no |
| `_awardTerritoryInfluence` | `engine.js:60` | nessuna | nessuno | no |
| `_b2bCarRank` | `b2b.js:24` | nessuna | nessuno | no |
| `_b2bDailyTick` | `b2b.js:148` | nessuna | nessuno | CE_money (`accreditatoDalServer, addReputation`) / RPC (`rpc_b2b_daily_tick`) |
| `_b2bFetchActive` | `b2b.js:45` | nessuna | nessuno | no |
| `_b2bFetchContracts` | `b2b.js:39` | nessuna | nessuno | RPC (`rpc_get_b2b_contracts`) |
| `_b2bReqRank` | `b2b.js:25` | nessuna | nessuno | no |
| `_bridgeFleetToGameState` | `serverState.js:217` | nessuna | nessuno | no |
| `_bridgeToGameState` | `serverState.js:202` | nessuna | nessuno | diretto (`gameState.cash   =, gameState.driverCoins           =, gameState.vtkBalance            =`) |
| `_broadcastNews` | `engine.js:2090` | nessuna | nessuno | RPC (`rpc_broadcast_news`) |
| `_bufToB64url` | `push-notifications.js:35` | nessuna | nessuno | no |
| `_buildActiveStory` | `ui-career.js:365` | nessuna | nessuno | no |
| `_buildBackdrop` | `tutorial.js:203` | nessuna | nessuno | no |
| `_buildBox` | `tutorial.js:239` | nessuna | nessuno | no |
| `_buildCareerModal` | `ui-career.js:226` | nessuna | nessuno | no |
| `_buildClaimMile` | `ui-career.js:453` | nessuna | nessuno | no |
| `_buildClaimStory` | `ui-career.js:428` | nessuna | nessuno | no |
| `_buildMileRow` | `ui-career.js:467` | nessuna | nessuno | no |
| `_buildRewardChips` | `ui-career.js:481` | nessuna | nessuno | no |
| `_buildRideWaypoints` | `map-router.js:46` | nessuna | nessuno | no |
| `_buildRideWaypoints` | `map-router.js:143` | nessuna | nessuno | no |
| `_buildSparkline` | `ui-finance.js:126` | nessuna | nessuno | no |
| `_cAIScore` | `contracts.js:144` | nessuna | nessuno | no |
| `_cancelFoundingMode` | `ui-map-utils.js:123` | `_cancelFoundingMode` (`ui-map-utils.js`) | nessuno | no |
| `_carGetData` | `ui-career.js:185` | nessuna | nessuno | no |
| `_carIsUnlocked` | `ui-career.js:168` | nessuna | nessuno | no |
| `_carRewardLine` | `ui-career.js:172` | nessuna | nessuno | no |
| `_cCountQualifying` | `contracts.js:127` | nessuna | nessuno | no |
| `_ceCapitalismAck` | `zero-to-hero.js:133` | `_ceCapitalismAck` (`zero-to-hero.js`) | nessuno | no |
| `_ceCardOf` | `motion.js:69` | nessuna | nessuno | no |
| `_ceClearReturnNotif` | `push-notifications.js:142` | nessuna | nessuno | no |
| `_ceKpiOrbit` | `motion.js:59` | nessuna | nessuno | no |
| `_ceOnReturn` | `push-notifications.js:182` | nessuna | nessuno | no |
| `_ceOrbitTick` | `motion.js:77` | nessuna | nessuno | no |
| `_cePushHeartbeat` | `push-notifications.js:116` | nessuna | nessuno | no |
| `_cePushSubscribe` | `push-notifications.js:63` | nessuna | nessuno | no |
| `_ceRequestNotifPerm` | `push-notifications.js:163` | nessuna | nessuno | no |
| `_ceRevealScan` | `motion.js:154` | nessuna | nessuno | no |
| `_cErr` | `crypto.js:16` | nessuna | nessuno | no |
| `_ceScheduleReturnNotif` | `push-notifications.js:133` | nessuna | nessuno | no |
| `_ceSendReturnNotif` | `push-notifications.js:150` | nessuna | nessuno | no |
| `_ceStagger` | `motion.js:127` | nessuna | nessuno | no |
| `_ceStoreSubscription` | `push-notifications.js:92` | nessuna | nessuno | no |
| `_ceTriggerCountUps` | `motion.js:49` | nessuna | nessuno | no |
| `_checkAchievements` | `engine.js:382` | nessuna | nessuno | no |
| `_checkDailyReward` | `engine-daily.js:1109` | nessuna | nessuno | CE_money (`earn, earnDC`) |
| `_checkDailyReward` | `engine-daily.js:1166` | nessuna | nessuno | no |
| `_checkDriverLevel` | `engine.js:1149` | nessuna | nessuno | no |
| `_checkFoundingOverlay` | `ui-map-utils.js:83` | nessuna | nessuno | no |
| `_checkPrestige` | `engine.js:1185` | nessuna | nessuno | no |
| `_clearDOM` | `tutorial.js:338` | nessuna | nessuno | no |
| `_closeVittorioModal` | `vittorio.js:144` | `_closeVittorioModal` (`vittorio.js`) | nessuno | no |
| `_cloudSaveSlot` | `saveSystem.js:171` | nessuna | nessuno | no |
| `_co2TaxForRide` | `engine.js:349` | nessuna | nessuno | no |
| `_co2TaxForRide` | `engine.js:354` | nessuna | nessuno | no |
| `_collectEarnings` | `contracts.js:214` | nessuna | nessuno | CE_money (`earn`) |
| `_collectTabs` | `cmd-palette.js:15` | nessuna | nessuno | no |
| `_confirmNewGame` | `saveSystem.js:327` | `_confirmNewGame` (`saveSystem.js`) | nessuno | no |
| `_confirmNewGame` | `saveSystem.js:348` | `_confirmNewGame` (`saveSystem.js`) | nessuno | no |
| `_countdown` | `auctions.js:25` | nessuna | nessuno | no |
| `_cPlayerScore` | `contracts.js:134` | nessuna | nessuno | no |
| `_cryptoSubscribeRealtime` | `crypto.js:312` | nessuna | nessuno | no |
| `_cryptoUpdatePreview` | `crypto.js:192` | nessuna | nessuno | no |
| `_currentUserId` | `push-notifications.js:42` | nessuna | nessuno | no |
| `_dayCompleted` | `ui-career.js:351` | nessuna | nessuno | no |
| `_dcSimPurchase` | `ui-store.js:261` | `_dcSimPurchase` (`ui-store.js`) | nessuno | CE_money (`earnDC`) |
| `_dcSpend` | `ui-store.js:269` | `_dcSpend` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `_deserializeRide` | `engine.js:446` | nessuna | nessuno | no |
| `_destroyMap` | `map.js:279` | nessuna | nessuno | no |
| `_destroyMap` | `map.js:289` | nessuna | nessuno | no |
| `_driverCanTakeRide` | `engine-rides.js:348` | nessuna | nessuno | no |
| `_driverOk` | `quests-data.js:45` | nessuna | nessuno | no |
| `_dsEsc` | `design-system.js:9` | nessuna | nessuno | no |
| `_earlyGates` | `objective-tracker.js:44` | nessuna | nessuno | no |
| `_ecCaffeSospeso` | `ui-store.js:318` | `_ecCaffeSospeso` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `_ecManutenzioneExpress` | `ui-store.js:331` | `_ecManutenzioneExpress` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `_ecPolizzaKasko` | `ui-store.js:354` | `_ecPolizzaKasko` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `_ecRadarVip` | `ui-store.js:371` | `_ecRadarVip` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `_ecSwitchTab` | `ui-store.js:7` | `_ecSwitchTab` (`ui-store.js`) | nessuno | no |
| `_ecTangenteSindacato` | `ui-store.js:344` | `_ecTangenteSindacato` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `_ecTargaPresidenziale` | `ui-store.js:382` | `_ecTargaPresidenziale` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `_emailBadgeClass` | `ui-emails.js:117` | nessuna | nessuno | no |
| `_emailBadgeLabel` | `ui-emails.js:127` | nessuna | nessuno | no |
| `_emailCardClass` | `ui-emails.js:107` | nessuna | nessuno | no |
| `_emailSenderIcon` | `ui-emails.js:142` | nessuna | nessuno | no |
| `_emHighlightCategory` | `em-chrome.js:81` | nessuna | nessuno | no |
| `_emSyncChromeOffset` | `em-chrome.js:49` | nessuna | nessuno | no |
| `_end` | `tutorial.js:352` | nessuna | nessuno | no |
| `_ensure` | `vanity.js:28` | nessuna | nessuno | no |
| `_ensureCompany` | `serverState.js:354` | nessuna | nessuno | no |
| `_ensureMap` | `map.js:273` | nessuna | nessuno | no |
| `_ensureRivalState` | `engine-rivals.js:39` | nessuna | nessuno | no |
| `_expireContracts` | `contracts.js:221` | nessuna | nessuno | no |
| `_fetchLpRankings` | `ui-landing.js:431` | nessuna | nessuno | no |
| `_fetchRoadGeom` | `map.js:23` | nessuna | nessuno | no |
| `_filtered` | `cmd-palette.js:23` | nessuna | nessuno | no |
| `_findEmptyLegRide` | `engine-rides.js:13` | nessuna | nessuno | no |
| `_findHWPath` | `map-router.js:25` | nessuna | nessuno | no |
| `_flashTicker` | `ui-finance.js:4` | nessuna | nessuno | no |
| `_flush` | `security.js:150` | nessuna | nessuno | no |
| `_fmt` | `crypto.js:24` | nessuna | nessuno | no |
| `_fmtCoin` | `crypto.js:29` | nessuna | nessuno | no |
| `_fmtCurrency` | `auctions.js:20` | nessuna | nessuno | no |
| `_fmtTs` | `saveSystem.js:50` | nessuna | nessuno | no |
| `_formatDuration` | `engine-rides.js:239` | nessuna | nessuno | no |
| `_formatDuration` | `engine-rides.js:996` | nessuna | nessuno | no |
| `_generateBatch` | `contracts.js:164` | nessuna | nessuno | no |
| `_generateLegendaryRecruit` | `engine.js:743` | nessuna | nessuno | no |
| `_generateRecruit` | `engine.js:717` | nessuna | nessuno | no |
| `_generateVehicleSVG` | `map-garage.js:132` | nessuna | nessuno | no |
| `_getBrandPrestigeBonus` | `engine.js:125` | nessuna | nessuno | no |
| `_getBrandVolumeBonus` | `engine.js:116` | nessuna | nessuno | no |
| `_getBuffValue` | `vip-buffs.js:29` | nessuna | nessuno | no |
| `_getCantieriSpeedMult` | `engine-events.js:269` | nessuna | nessuno | no |
| `_getCreditTier` | `engine-finance.js:151` | nessuna | nessuno | no |
| `_getCreditTier` | `engine-finance.js:158` | nessuna | nessuno | no |
| `_getDriverQueueInfo` | `engine-rides.js:250` | nessuna | nessuno | no |
| `_getDriverQueueInfo` | `engine-rides.js:997` | nessuna | nessuno | no |
| `_getHWGraph` | `map-router.js:11` | nessuna | nessuno | no |
| `_getItalyTime` | `engine.js:969` | nessuna | nessuno | no |
| `_getLoanInterestRate` | `engine.js:1174` | nessuna | nessuno | no |
| `_getMaxStaff` | `engine.js:1306` | nessuna | nessuno | no |
| `_getPrestige` | `engine.js:1166` | nessuna | nessuno | no |
| `_getRankPosition` | `engine.js:370` | nessuna | nessuno | no |
| `_getRideDurationMs` | `engine-rides.js:224` | nessuna | nessuno | no |
| `_getRideDurationMs` | `engine-rides.js:995` | nessuna | nessuno | no |
| `_getSeasonalMult` | `engine.js:375` | nessuna | nessuno | no |
| `_getSlotMeta` | `saveSystem.js:27` | nessuna | nessuno | no |
| `_getTrafficMult` | `engine.js:705` | nessuna | nessuno | no |
| `_globalEventsSubscribe` | `global_events.js:148` | nessuna | nessuno | no |
| `_go` | `cmd-palette.js:98` | nessuna | nessuno | no |
| `_gs` | `money.js:22` | nessuna | `onboarding-core.js:21` | no |
| `_gs` | `onboarding-core.js:21` | nessuna | `money.js:22` | no |
| `_handleRpcError` | `serverState.js:570` | nessuna | nessuno | no |
| `_hasFleet` | `quests-data.js:30` | nessuna | nessuno | no |
| `_hasWealthManager` | `engine-finance.js:13` | nessuna | nessuno | no |
| `_hasWealthManager` | `engine-finance.js:16` | nessuna | nessuno | no |
| `_highlight` | `cmd-palette.js:80` | nessuna | nessuno | no |
| `_homeCashFmt` | `ui-home.js:22` | nessuna | nessuno | no |
| `_homeContractCard` | `ui-home.js:110` | nessuna | nessuno | no |
| `_homeEsc` | `ui-home.js:4` | nessuna | nessuno | no |
| `_homeLevel` | `ui-home.js:6` | nessuna | nessuno | no |
| `_homeStreakCard` | `ui-home.js:29` | nessuna | nessuno | no |
| `_homeWeeklyBanner` | `ui-home.js:80` | nessuna | nessuno | no |
| `_hqBuildFromList` | `hq.js:373` | `_hqBuildFromList` (`hq.js`) | nessuno | no |
| `_hqDailyTick` | `hq.js:339` | nessuna | nessuno | no |
| `_hqNascondiNavigazione` | `hq.js:13` | nessuna | nessuno | no |
| `_hqNascondiNavigazione` | `hq.js:21` | nessuna | nessuno | no |
| `_infraBuyDepot` | `infrastructure.js:164` | `_infraBuyDepot` (`infrastructure.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_fuel_depot`) |
| `_infraSetMarkup` | `infrastructure.js:192` | `_infraSetMarkup` (`infrastructure.js`) | nessuno | RPC (`rpc_set_fuel_markup`) |
| `_initGlobalNewsFeed` | `ui-realestate.js:16` | nessuna | nessuno | no |
| `_initStockPrices` | `engine-finance.js:19` | nessuna | nessuno | no |
| `_injectLangToggle` | `lang.js:191` | nessuna | nessuno | no |
| `_isElectric` | `engine.js:340` | nessuna | nessuno | no |
| `_isMobile` | `dispatcher.js:9` | nessuna | nessuno | no |
| `_kickstartIdleDrivers` | `engine.js:832` | nessuna | nessuno | no |
| `_kpi` | `ui-finance.js:87` | nessuna | `ui-ranking.js:105` | no |
| `_kpi` | `ui-ranking.js:105` | nessuna | `ui-finance.js:87` | no |
| `_listCompanyIPO_NPC` | `engine-holding.js:93` | nessuna | nessuno | CE_money (`spend, earn`) |
| `_load` | `security.js:79` | nessuna | nessuno | no |
| `_loadOPAList` | `hostile_takeover.js:36` | nessuna | nessuno | RPC (`rpc_get_hostile_takeovers`) |
| `_loadSnapshot` | `serverState.js:63` | nessuna | nessuno | no |
| `_maybeDiamondContract` | `engine.js:1947` | nessuna | nessuno | no |
| `_maybeGenerateCantieri` | `engine-events.js:238` | nessuna | nessuno | no |
| `_maybeGenerateDynamicEvent` | `engine-events.js:69` | nessuna | nessuno | no |
| `_maybeGenerateFine` | `engine-events.js:148` | nessuna | nessuno | no |
| `_maybeGenerateZTLFine` | `engine-events.js:202` | nessuna | nessuno | no |
| `_maybeGreyMarketMission` | `engine-daily.js:285` | nessuna | nessuno | no |
| `_maybeLaunchTutorial` | `tutorial.js:135` | nessuna | nessuno | no |
| `_maybeParazziEvent` | `engine-events.js:360` | nessuna | nessuno | CE_money (`earn, addReputation`) |
| `_maybePoliceCheckpoint` | `engine-events.js:278` | nessuna | nessuno | no |
| `_maybeRivalSabotage` | `engine-rivals.js:104` | nessuna | nessuno | no |
| `_maybeShadowMission` | `engine.js:1345` | nessuna | nessuno | no |
| `_maybeStartAuction` | `engine.js:790` | nessuna | nessuno | no |
| `_maybeStrike` | `engine-events.js:44` | nessuna | nessuno | no |
| `_maybeVipEmiro` | `vip-clients.js:327` | nessuna | nessuno | no |
| `_maybeVipErede` | `vip-clients.js:704` | nessuna | nessuno | no |
| `_maybeVipGarante` | `vip-clients.js:503` | nessuna | nessuno | no |
| `_maybeVipGolden` | `vip-clients.js:383` | nessuna | nessuno | no |
| `_maybeVipGrigori` | `vip-clients.js:25` | nessuna | nessuno | no |
| `_maybeVipOnorevole` | `vip-clients.js:243` | nessuna | nessuno | no |
| `_maybeVipPlatinum` | `vip-clients.js:169` | nessuna | nessuno | no |
| `_maybeVipStrata` | `vip-clients.js:109` | nessuna | nessuno | no |
| `_maybeVipTechBro` | `vip-clients.js:454` | nessuna | nessuno | no |
| `_maybeVipWedding` | `vip-clients.js:601` | nessuna | nessuno | no |
| `_mmoBootSequence` | `auth.js:33` | nessuna | nessuno | RPC (`rpc_process_offline_gains`) |
| `_mRun` | `quests-data.js:28` | nessuna | nessuno | no |
| `_nemesisAddVip` | `nemesis.js:10` | nessuna | nessuno | no |
| `_nemesisBribeVip` | `nemesis.js:101` | `_nemesisBribeVip` (`nemesis.js`) | nessuno | CE_money (`spend`) |
| `_nemesisFundRival` | `nemesis.js:66` | nessuna | nessuno | RPC (`rpc_nemesis_fund_rival`) |
| `_nemesisTick` | `nemesis.js:51` | nessuna | nessuno | no |
| `_onAuthSuccess` | `auth.js:313` | nessuna | nessuno | no |
| `_onCompanyChange` | `serverState.js:146` | nessuna | nessuno | diretto (`gameState.cash +=`) |
| `_onDriverChange` | `serverState.js:170` | nessuna | nessuno | no |
| `_onKey` | `cmd-palette.js:89` | nessuna | nessuno | no |
| `_onTripChange` | `serverState.js:175` | nessuna | nessuno | no |
| `_onVehicleChange` | `serverState.js:164` | nessuna | nessuno | no |
| `_opaRequestBuyback` | `hostile_takeover.js:126` | `_opaRequestBuyback` (`hostile_takeover.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_opa_buyback`) |
| `_openSyncDB` | `syncManager.js:37` | nessuna | nessuno | no |
| `_p2pErrMsg` | `p2p-market.js:13` | nessuna | nessuno | no |
| `_payStockDividends` | `engine-finance.js:55` | nessuna | nessuno | CE_money (`earn`) |
| `_persistHandle` | `syncManager.js:46` | nessuna | nessuno | no |
| `_positionBox` | `tutorial.js:301` | nessuna | nessuno | no |
| `_prestige` | `onboarding.js:15` | nessuna | nessuno | no |
| `_previewQueueWithRide` | `engine-rides.js:284` | nessuna | nessuno | no |
| `_previewQueueWithRide` | `engine-rides.js:998` | nessuna | nessuno | no |
| `_priceImpact` | `crypto.js:35` | nessuna | nessuno | no |
| `_pruneExpiredBuffs` | `vip-buffs.js:37` | nessuna | nessuno | no |
| `_questUnlocked` | `quests-data.js:49` | nessuna | nessuno | no |
| `_realShowNotification` | `dispatcher.js:264` | nessuna | nessuno | no |
| `_realWeatherGetTrafficMult` | `weather_real.js:84` | nessuna | nessuno | no |
| `_realWeatherSubscribe` | `weather_real.js:127` | nessuna | nessuno | no |
| `_reconcileLocalRideOnClaim` | `serverState.js:235` | nessuna | nessuno | no |
| `_redact` | `security.js:142` | nessuna | nessuno | no |
| `_refreshNpcMarket` | `engine.js:772` | nessuna | nessuno | no |
| `_refreshRecruits` | `engine.js:734` | nessuna | nessuno | no |
| `_render` | `tutorial.js:148` | nessuna | nessuno | no |
| `_renderAvailableCard` | `infrastructure.js:113` | nessuna | nessuno | no |
| `_renderBrowse` | `alliances.js:213` | nessuna | nessuno | no |
| `_renderContractCard` | `contracts.js:487` | nessuna | nessuno | no |
| `_renderDecreesSection` | `ui-politics.js:110` | nessuna | nessuno | no |
| `_renderInfraContent` | `infrastructure.js:41` | nessuna | nessuno | no |
| `_renderList` | `cmd-palette.js:60` | nessuna | nessuno | no |
| `_renderMember` | `alliances.js:85` | nessuna | nessuno | no |
| `_renderMyDepotCard` | `infrastructure.js:88` | nessuna | nessuno | no |
| `_renderNemesisCard` | `nemesis.js:170` | nessuna | nessuno | no |
| `_renderOccupiedCard` | `infrastructure.js:130` | nessuna | nessuno | no |
| `_renderOPACard` | `hostile_takeover.js:66` | nessuna | nessuno | no |
| `_renderRivalCard` | `infrastructure.js:150` | nessuna | nessuno | no |
| `_renderTenderCard` | `contracts.js:418` | nessuna | nessuno | no |
| `_resolve` | `contracts.js:182` | nessuna | nessuno | CE_money (`earn`) |
| `_resolveAuction` | `engine.js:806` | nessuna | nessuno | CE_money (`earn`) |
| `_restoreHandle` | `syncManager.js:53` | nessuna | nessuno | no |
| `_retryOutOfServiceVehicles` | `engine-daily.js:273` | nessuna | nessuno | no |
| `_rides` | `onboarding.js:14` | nessuna | `zero-to-hero.js:17` | no |
| `_rides` | `zero-to-hero.js:17` | nessuna | `onboarding.js:14` | no |
| `_rpc` | `alliances.js:286` | nessuna | `serverState.js:370` | no |
| `_rpc` | `serverState.js:370` | nessuna | `alliances.js:286` | no |
| `_save` | `security.js:82` | nessuna | `vanity.js:160` | no |
| `_save` | `vanity.js:160` | nessuna | `security.js:82` | no |
| `_sb` | `b2b.js:34` | nessuna | `p2p-market.js:49` | no |
| `_sb` | `p2p-market.js:49` | nessuna | `b2b.js:34` | no |
| `_sec` | `ui-finance.js:95` | nessuna | nessuno | no |
| `_sendDriverToRest` | `engine-daily.js:13` | nessuna | nessuno | no |
| `_serializeRide` | `engine.js:423` | nessuna | nessuno | no |
| `_sErr` | `black_ops.js:80` | nessuna | nessuno | no |
| `_setAuthError` | `ui-landing.js:458` | nessuna | nessuno | no |
| `_setAuthLoading` | `ui-landing.js:463` | nessuna | nessuno | no |
| `_showAuthOverlay` | `ui-landing.js:11` | nessuna | nessuno | no |
| `_showBivioModal` | `ui-career.js:546` | nessuna | nessuno | no |
| `_showCompanySetup` | `saveSystem.js:276` | nessuna | nessuno | no |
| `_showOfflineGainsModal` | `auth.js:212` | nessuna | nessuno | no |
| `_showSaveIndicator` | `engine.js:687` | nessuna | nessuno | no |
| `_sidebarActivateTab` | `ui-sidebar.js:45` | nessuna | nessuno | no |
| `_sidebarToggle` | `ui-sidebar.js:21` | `_sidebarToggle` (`index.html`) | nessuno | no |
| `_simpleHash` | `syncManager.js:13` | nessuna | nessuno | no |
| `_sincronizzaCassa` | `money.js:33` | nessuna | nessuno | no |
| `_sindacatoGdfDailyCheck` | `p2p-market.js:425` | nessuna | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_gdf_inspection_check`) |
| `_sparkCemp` | `ui-finance.js:294` | nessuna | nessuno | no |
| `_srmAnimatePrice` | `showroom.js:672` | nessuna | nessuno | no |
| `_srmBackToGallery` | `showroom.js:594` | `_srmBackToGallery` (`showroom.js`) | nessuno | no |
| `_srmBrand` | `showroom.js:58` | nessuna | nessuno | no |
| `_srmCatalog` | `showroom.js:103` | nessuna | nessuno | no |
| `_srmClose` | `showroom.js:333` | `_srmClose` (`showroom.js`) | nessuno | no |
| `_srmComputeStats` | `showroom.js:127` | nessuna | nessuno | no |
| `_srmFilterBrand` | `showroom.js:428` | `_srmFilterBrand` (`showroom.js`) | nessuno | no |
| `_srmFilterFuel` | `showroom.js:421` | `_srmFilterFuel` (`showroom.js`) | nessuno | no |
| `_srmFuelGroup` | `showroom.js:52` | nessuna | nessuno | no |
| `_srmGetArg` | `showroom.js:603` | nessuna | nessuno | no |
| `_srmInjectStyles` | `showroom.js:142` | nessuna | nessuno | no |
| `_srmOpenConfig` | `showroom.js:435` | `_srmOpenConfig` (`showroom.js`) | nessuno | no |
| `_srmOptCount` | `showroom.js:137` | nessuna | nessuno | no |
| `_srmPurchase` | `showroom.js:695` | `_srmPurchase` (`showroom.js`) | nessuno | CE_money (`spend`) |
| `_srmRenderConfig` | `showroom.js:448` | nessuna | nessuno | no |
| `_srmRenderGallery` | `showroom.js:343` | nessuna | nessuno | no |
| `_srmSectionContent` | `showroom.js:499` | nessuna | nessuno | no |
| `_srmSetSection` | `showroom.js:611` | `_srmSetSection` (`showroom.js`) | nessuno | no |
| `_srmTierColor` | `showroom.js:109` | nessuna | nessuno | no |
| `_srmToggle` | `showroom.js:628` | `_srmToggle` (`showroom.js`) | nessuno | no |
| `_srmTotalPrice` | `showroom.js:117` | nessuna | nessuno | no |
| `_srmVehicle` | `showroom.js:106` | nessuna | nessuno | no |
| `_startFoundingMode` | `ui-map-utils.js:100` | `_startFoundingMode` (`ui-map-utils.js`) | nessuno | no |
| `_startGameWithSlot` | `engine.js:2101` | nessuna | nessuno | no |
| `_startHeartbeat` | `auth.js:259` | nessuna | nessuno | RPC (`rpc_ping`) |
| `_stopMarketingCampaign` | `engine.js:172` | `_stopMarketingCampaign` (`ui-marketing.js`) | nessuno | no |
| `_stopMarketingCampaign` | `engine.js:180` | `_stopMarketingCampaign` (`ui-marketing.js`) | nessuno | no |
| `_subscribeChat` | `alliances.js:265` | nessuna | nessuno | no |
| `_subscribeRealtime` | `serverState.js:99` | nessuna | nessuno | no |
| `_tabIs` | `engine.js:367` | nessuna | nessuno | no |
| `_tabUnlock` | `onboarding.js:16` | nessuna | nessuno | no |
| `_tBarColor` | `tourism.js:78` | nessuna | nessuno | no |
| `_tCountdown` | `tourism.js:59` | nessuna | nessuno | no |
| `_tickBrokerInvestments` | `engine-finance.js:75` | nessuna | nessuno | CE_money (`earn`) |
| `_tickCantieri` | `engine-events.js:259` | nessuna | nessuno | no |
| `_tickDriverSatisfaction` | `engine-daily.js:1065` | nessuna | nessuno | CE_money (`earn`) |
| `_tickDynamicEvent` | `engine-events.js:133` | nessuna | nessuno | no |
| `_tickEmails` | `engine-daily.js:148` | nessuna | nessuno | no |
| `_tickFatigue` | `engine-daily.js:19` | nessuna | nessuno | no |
| `_tickFuelPrice` | `engine-daily.js:187` | nessuna | nessuno | no |
| `_tickMacroEconomy` | `engine-finance.js:161` | nessuna | nessuno | no |
| `_tickPoliceHeat` | `engine-events.js:11` | nessuna | nessuno | no |
| `_tickPricewars` | `engine-rivals.js:9` | nessuna | nessuno | no |
| `_tickRivalsActive` | `engine-rivals.js:47` | nessuna | nessuno | no |
| `_tickRivalsDaily` | `engine-rivals.js:92` | nessuna | nessuno | no |
| `_tickStockHistory` | `engine-finance.js:191` | nessuna | nessuno | no |
| `_tickStockMarket` | `engine-finance.js:33` | nessuna | nessuno | no |
| `_tickWeather` | `engine-daily.js:113` | nessuna | nessuno | no |
| `_tier` | `daily-orders.js:12` | nessuna | nessuno | no |
| `_tierBadge` | `auctions.js:39` | nessuna | nessuno | no |
| `_tierBorderColor` | `contracts.js:414` | nessuna | nessuno | no |
| `_tMeetsReqs` | `tourism.js:47` | nessuna | nessuno | no |
| `_today` | `daily-orders.js:69` | nessuna | nessuno | no |
| `_tourismDailyTick` | `tourism.js:152` | nessuna | nessuno | CE_money (`accreditatoDalServer`) / RPC (`rpc_tourism_daily_tick`) |
| `_tPlayerScore` | `tourism.js:32` | nessuna | nessuno | no |
| `_tQualifyingCount` | `tourism.js:25` | nessuna | nessuno | no |
| `_trailGeom` | `map-visual.js:14` | nessuna | nessuno | no |
| `_traitBadgeHTML` | `ui-map-utils.js:228` | nessuna | nessuno | no |
| `_translateAuthError` | `ui-landing.js:547` | nessuna | nessuno | no |
| `_tRenderCooldownCard` | `tourism.js:419` | nessuna | nessuno | no |
| `_tRenderLockedCard` | `tourism.js:401` | nessuna | nessuno | no |
| `_tRenderMyContracts` | `tourism.js:438` | nessuna | nessuno | no |
| `_tRenderOpenBids` | `tourism.js:287` | nessuna | nessuno | no |
| `_tRenderOpenCard` | `tourism.js:317` | nessuna | nessuno | no |
| `_triggerBankruptcy` | `engine-events.js:25` | nessuna | nessuno | CE_money (`earn`) |
| `_triggerVIPMidRideEvent` | `engine.js:1206` | nessuna | nessuno | CE_money (`spend`) |
| `_tSb` | `tourism.js:22` | nessuna | nessuno | no |
| `_tSetPledge` | `tourism.js:203` | nessuna | nessuno | no |
| `_tTierBadge` | `tourism.js:70` | nessuna | nessuno | no |
| `_tUid` | `tourism.js:23` | nessuna | nessuno | no |
| `_tUpdateScorePreview` | `tourism.js:179` | nessuna | nessuno | no |
| `_tutActionSignal` | `tutorial.js:180` | nessuna | nessuno | no |
| `_uid` | `b2b.js:35` | nessuna | `p2p-market.js:50` | no |
| `_uid` | `p2p-market.js:50` | nessuna | `b2b.js:35` | no |
| `_unsubscribeChat` | `alliances.js:260` | nessuna | nessuno | no |
| `_updateActiveRouteLines` | `map.js:343` | nessuna | nessuno | no |
| `_updateActiveRouteLines` | `map.js:373` | nessuna | nessuno | no |
| `_updateCloudDot` | `saveSystem.js:158` | nessuna | nessuno | no |
| `_updateContractDestinations` | `map.js:336` | nessuna | nessuno | no |
| `_updateCreditScore` | `engine-finance.js:138` | nessuna | nessuno | no |
| `_updateDayNight` | `ui-map-utils.js:27` | nessuna | nessuno | no |
| `_updateDayNight` | `ui-map-utils.js:40` | nessuna | nessuno | no |
| `_updateHQMarker` | `ui-map-utils.js:55` | nessuna | nessuno | no |
| `_updateHubStats` | `ui-hub.js:37` | nessuna | nessuno | no |
| `_updateHubStats` | `ui-hub.js:98` | nessuna | nessuno | no |
| `_updatePOIVisibility` | `map.js:426` | nessuna | nessuno | no |
| `_updateRegionLabels` | `map.js:324` | nessuna | nessuno | no |
| `_updateTrafficLabel` | `ui-dispatch.js:225` | nessuna | nessuno | no |
| `_updateVehicleLayer` | `map.js:291` | nessuna | nessuno | no |
| `_upsertLeaderboard` | `saveSystem.js:213` | nessuna | nessuno | no |
| `_urlBase64ToUint8Array` | `push-notifications.js:26` | nessuna | nessuno | no |
| `_usedIds` | `contracts.js:158` | nessuna | nessuno | no |
| `_vanityApplyBrand` | `vanity.js:43` | nessuna | nessuno | no |
| `_vanityColor` | `vanity.js:137` | `_vanityColor` (`vanity.js`) | nessuno | CE_money (`spendDC`) |
| `_vanityEmblem` | `vanity.js:125` | `_vanityEmblem` (`vanity.js`) | nessuno | CE_money (`spendDC`) |
| `_vanityTitle` | `vanity.js:149` | `_vanityTitle` (`vanity.js`) | nessuno | CE_money (`spendDC`) |
| `_vehicleOk` | `quests-data.js:34` | nessuna | nessuno | no |
| `_verifyChecksum` | `syncManager.js:28` | nessuna | nessuno | no |
| `_veteran` | `zero-to-hero.js:18` | nessuna | nessuno | no |
| `_vipAssignedDriver` | `vip-buffs.js:120` | nessuna | nessuno | no |
| `_vipBuffTick` | `vip-buffs.js:48` | nessuna | nessuno | no |
| `_vipCompleteEmiro` | `vip-clients.js:366` | nessuna | nessuno | CE_money (`earn`) |
| `_vipCompleteErede` | `vip-clients.js:743` | nessuna | nessuno | CE_money (`earn, addReputation`) |
| `_vipCompleteGarante` | `vip-clients.js:540` | nessuna | nessuno | no |
| `_vipCompleteGolden` | `vip-clients.js:420` | nessuna | nessuno | no |
| `_vipCompleteGrigori` | `vip-clients.js:65` | nessuna | nessuno | CE_money (`earn, addReputation`) |
| `_vipCompleteOnorevole` | `vip-clients.js:284` | nessuna | nessuno | no |
| `_vipCompletePlatinum` | `vip-clients.js:206` | nessuna | nessuno | no |
| `_vipCompleteStrata` | `vip-clients.js:146` | nessuna | nessuno | CE_money (`spend`) |
| `_vipCompleteTechBro` | `vip-clients.js:495` | nessuna | nessuno | no |
| `_vipCompleteWedding` | `vip-clients.js:641` | nessuna | nessuno | no |
| `_vipCooldownOk` | `vip-buffs.js:52` | nessuna | nessuno | no |
| `_vipCreateRide` | `vip-buffs.js:96` | nessuna | nessuno | no |
| `_vipFleetCar` | `vip-buffs.js:108` | nessuna | nessuno | no |
| `_vipMailDot` | `vip-buffs.js:63` | nessuna | nessuno | no |
| `_vipOnComplete` | `vip-clients.js:772` | nessuna | nessuno | no |
| `_vipPushEmail` | `vip-buffs.js:81` | nessuna | nessuno | no |
| `_vipRandomPoi` | `vip-buffs.js:68` | nessuna | nessuno | no |
| `_vipRandomRoute` | `vip-buffs.js:73` | nessuna | nessuno | no |
| `_vipRefreshUI` | `vip-buffs.js:91` | nessuna | nessuno | no |
| `_vipResolveEmail` | `vip-buffs.js:86` | nessuna | nessuno | no |
| `_vipSetCooldown` | `vip-buffs.js:58` | nessuna | nessuno | no |
| `_vipSyncCash` | `vip-clients.js:18` | nessuna | nessuno | no |
| `_vittorioDebt` | `vittorio.js:40` | nessuna | nessuno | no |
| `_vtkRenderMarket` | `vtk-market.js:314` | nessuna | nessuno | no |
| `_vtkRenderShop` | `vtk-market.js:387` | nessuna | nessuno | no |
| `_watchActionGate` | `tutorial.js:187` | nessuna | nessuno | no |
| `_worldOnline` | `world-feed.js:128` | nessuna | nessuno | no |
| `_wrAcquire` | `war_room.js:477` | `_wrAcquire` (`war_room.js`) | nessuno | no |
| `_wrClose` | `war_room.js:354` | `_wrClose` (`war_room.js`) | nessuno | no |
| `_wrFeatureCentroid` | `war_room.js:89` | nessuna | nessuno | no |
| `_wrFeatureToPath` | `war_room.js:80` | nessuna | nessuno | no |
| `_wrFill` | `war_room.js:154` | nessuna | nessuno | no |
| `_wrGeoToSVG` | `war_room.js:120` | nessuna | nessuno | no |
| `_wrGetSvgId` | `war_room.js:104` | nessuna | nessuno | no |
| `_wrInjectStyles` | `war_room.js:174` | nessuna | nessuno | no |
| `_wrLoadGeo` | `war_room.js:110` | nessuna | nessuno | no |
| `_wrProject` | `war_room.js:65` | nessuna | nessuno | no |
| `_wrRingToD` | `war_room.js:73` | nessuna | nessuno | no |
| `_wrSetupInteractions` | `war_room.js:363` | nessuna | nessuno | no |
| `_wrShowSidebar` | `war_room.js:382` | nessuna | nessuno | no |
| `_wrStroke` | `war_room.js:161` | nessuna | nessuno | no |
| `_wrStrokeW` | `war_room.js:167` | nessuna | nessuno | no |
| `_z2hApplyNav` | `zero-to-hero.js:28` | nessuna | nessuno | no |
| `_z2hRestricted` | `zero-to-hero.js:23` | nessuna | nessuno | no |
| `_z2hState` | `zero-to-hero.js:21` | nessuna | nessuno | no |
| `acceptDiamondContract` | `engine.js:1977` | `acceptDiamondContract` (`ui-emails.js`) | nessuno | CE_money (`earn`) |
| `acceptGreyMarket` | `engine-fleet.js:234` | `acceptGreyMarket` (`ui-emails.js`) | nessuno | no |
| `acceptShadowMission` | `engine.js:1378` | `acceptShadowMission` (`ui-emails.js`) | nessuno | no |
| `acceptVipEmiro` | `vip-clients.js:349` | `acceptVipEmiro` (`ui-emails.js`) | nessuno | no |
| `acceptVipErede` | `vip-clients.js:726` | `acceptVipErede` (`ui-emails.js`) | nessuno | no |
| `acceptVipGarante` | `vip-clients.js:524` | `acceptVipGarante` (`ui-emails.js`) | nessuno | no |
| `acceptVipGolden` | `vip-clients.js:404` | `acceptVipGolden` (`ui-emails.js`) | nessuno | no |
| `acceptVipGrigori` | `vip-clients.js:47` | `acceptVipGrigori` (`ui-emails.js`) | nessuno | no |
| `acceptVipOnorevole` | `vip-clients.js:266` | `acceptVipOnorevole` (`ui-emails.js`) | nessuno | no |
| `acceptVipPlatinum` | `vip-clients.js:190` | `acceptVipPlatinum` (`ui-emails.js`) | nessuno | no |
| `acceptVipStrata` | `vip-clients.js:130` | `acceptVipStrata` (`ui-emails.js`) | nessuno | no |
| `acceptVipTechBro` | `vip-clients.js:477` | `acceptVipTechBro` (`ui-emails.js`) | nessuno | no |
| `acceptVipWedding` | `vip-clients.js:623` | `acceptVipWedding` (`ui-emails.js`) | nessuno | no |
| `accreditatoDalServer` | `money.js:76` | nessuna | nessuno | no |
| `acquireProvince` | `serverState.js:437` | nessuna | nessuno | no |
| `acquireSubsidiary` | `engine-holding.js:36` | `acquireSubsidiary` (`ui-investments.js`) | nessuno | CE_money (`spend`) |
| `acquireVentureStake` | `engine-finance.js:419` | `acquireVentureStake` (`ui-investments.js`) | nessuno | CE_money (`spend`) |
| `activateExecutivePass` | `engine-store.js:10` | `activateExecutivePass` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `add` | `world-feed.js:69` | nessuna | nessuno | no |
| `addCheckpointMarker` | `map.js:473` | nessuna | nessuno | no |
| `addDriverCoins` | `serverState.js:528` | nessuna | nessuno | no |
| `addebitatoDalServer` | `money.js:94` | nessuna | nessuno | no |
| `addIncidentMarker` | `map.js:460` | nessuna | nessuno | no |
| `addProvinceInfluence` | `serverState.js:441` | nessuna | nessuno | no |
| `addReputation` | `money.js:170` | nessuna | nessuno | no |
| `ago` | `world-feed.js:131` | nessuna | nessuno | no |
| `applicaInterruttori` | `feature-gate.js:36` | nessuna | nessuno | no |
| `applicaInterruttori` | `feature-gate.js:62` | nessuna | nessuno | no |
| `applyAcquisition` | `engine.js:1792` | nessuna | nessuno | no |
| `applyNationalLicense` | `engine.js:1809` | nessuna | nessuno | no |
| `applySponsorship` | `engine.js:1803` | nessuna | nessuno | no |
| `applyVehicleSkin` | `engine-fleet.js:323` | nessuna | nessuno | CE_money (`spendDC`) |
| `assignAllRides` | `engine-rides.js:369` | `assignAllRides` (`ui-dispatch.js`) | nessuno | no |
| `assignCarToDriver` | `engine.js:1585` | `assignCarToDriver` (`ui-staff.js`) | nessuno | no |
| `assignRideToDriver` | `engine-rides.js:301` | nessuna | nessuno | no |
| `assignRideToDriver` | `engine-rides.js:991` | nessuna | nessuno | no |
| `assignSpecialty` | `engine-drivers.js:185` | nessuna | nessuno | no |
| `attackTerritory` | `engine.js:1409` | nessuna | nessuno | CE_money (`spend`) |
| `attiva` | `config.js:61` | nessuna | nessuno | no |
| `auctionsClaim` | `auctions.js:221` | nessuna | nessuno | CE_money (`accreditatoDalServer`) / RPC (`rpc_claim_auction`) |
| `auctionsConfirmBid` | `auctions.js:142` | `auctionsConfirmBid` (`auctions.js`) | nessuno | no |
| `auctionsInit` | `auctions.js:454` | nessuna | nessuno | no |
| `auctionsOpenBidModal` | `auctions.js:91` | `auctionsOpenBidModal` (`auctions.js`) | nessuno | no |
| `auctionsPlaceBid` | `auctions.js:76` | nessuna | nessuno | RPC (`rpc_place_auction_bid`) |
| `auctionsRefresh` | `auctions.js:57` | nessuna | nessuno | RPC (`rpc_get_judicial_auctions, rpc_get_won_auctions, rpc_get_my_bids`) |
| `auctionsRevealWon` | `auctions.js:254` | `auctionsRevealWon` (`auctions.js`) | nessuno | no |
| `authLogout` | `auth.js:346` | `authLogout` (`index.html`, `saveSystem.js`) | nessuno | no |
| `autoDispatchRides` | `engine-rides.js:403` | nessuna | nessuno | no |
| `autoDispatchRides` | `engine-rides.js:990` | nessuna | nessuno | no |
| `autoNegotiateEmails` | `engine-daily.js:1006` | nessuna | nessuno | CE_money (`earn, addReputation`) |
| `autoNegotiateEmails` | `engine-daily.js:1171` | nessuna | nessuno | no |
| `b2bAcceptContract` | `b2b.js:79` | nessuna | nessuno | RPC (`rpc_accept_b2b_contract`) |
| `b2bCheckLimit` | `b2b.js:261` | `b2bCheckLimit` (`b2b.js`) | nessuno | no |
| `b2bConfirmAccept` | `b2b.js:280` | `b2bConfirmAccept` (`b2b.js`) | nessuno | no |
| `b2bInit` | `b2b.js:446` | nessuna | nessuno | no |
| `b2bLockedDriverIds` | `b2b.js:70` | nessuna | nessuno | no |
| `b2bLockedVehicleIds` | `b2b.js:63` | nessuna | nessuno | no |
| `b2bOpenAcceptModal` | `b2b.js:180` | `b2bOpenAcceptModal` (`b2b.js`) | nessuno | no |
| `b2bRefresh` | `b2b.js:56` | nessuna | nessuno | no |
| `b2bTerminateContract` | `b2b.js:117` | `b2bTerminateContract` (`b2b.js`) | nessuno | CE_money (`addebitatoDalServer, addReputation`) / RPC (`rpc_terminate_b2b_contract`) |
| `bidOnAuction` | `engine-fleet.js:461` | `bidOnAuction` (`ui-market.js`) | nessuno | CE_money (`earn, spend`) |
| `boot` | `world-feed.js:197` | nessuna | nessuno | no |
| `buildContractDestinationsGeoJSON` | `geoCoords.js:553` | nessuna | nessuno | no |
| `buildContractDestinationsGeoJSON` | `geoCoords.js:587` | nessuna | nessuno | no |
| `bulkRepairFleet` | `ui-fleet.js:408` | `bulkRepairFleet` (`ui-fleet.js`) | nessuno | no |
| `buyAutoRest` | `serverState.js:516` | nessuna | nessuno | no |
| `buyBlackMarketFuel` | `engine-fleet.js:108` | nessuna | nessuno | no |
| `buyCARUpgrade` | `engine-fleet.js:217` | `buyCARUpgrade` (`ui-staff.js`) | nessuno | CE_money (`spend`) |
| `buyCempShares` | `engine-holding.js:66` | `buyCempShares` (`ui-finance.js`) | nessuno | CE_money (`spend`) |
| `buyCompanyShares` | `p2p-market.js:269` | `buyCompanyShares` (`p2p-render.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_company_shares`) |
| `buyEnergyRefill` | `serverState.js:519` | nessuna | nessuno | no |
| `buyFleetRepair` | `serverState.js:522` | nessuna | nessuno | no |
| `buyFuelForDepot` | `engine-fleet.js:145` | `buyFuelForDepot` (`ui-fleet.js`) | nessuno | CE_money (`spend`) |
| `buyHRAutomation` | `serverState.js:534` | `buyHRAutomation` (`ui-staff.js`) | `ui-ops.js:218` | no |
| `buyHRAutomation` | `ui-ops.js:218` | `buyHRAutomation` (`ui-staff.js`) | `serverState.js:534` | CE_money (`spendDC`) |
| `buyHub` | `engine-fleet.js:383` | `buyHub` (`ui-fleet.js`) | nessuno | CE_money (`spend`) |
| `buyInvestment` | `engine.js:1717` | `buyInvestment` (`ui-investments.js`) | `serverState.js:387` | no |
| `buyInvestment` | `serverState.js:387` | `buyInvestment` (`ui-investments.js`) | `engine.js:1717` | no |
| `buyLifestyleAsset` | `engine-finance.js:316` | `buyLifestyleAsset` (`ui-lifestyle.js`) | nessuno | CE_money (`spend`) |
| `buyMaintenanceContract` | `engine-fleet.js:290` | `buyMaintenanceContract` (`ui-fleet.js`) | nessuno | CE_money (`spend`) |
| `buyNpcCar` | `engine-fleet.js:441` | `buyNpcCar` (`ui-market.js`) | nessuno | CE_money (`spend`) |
| `buyP2PCar` | `p2p-market.js:128` | `buyP2PCar` (`p2p-render.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_market_car`) |
| `buyPrototypeCar` | `engine-fleet.js:364` | `buyPrototypeCar` (`ui-fleet.js`) | nessuno | CE_money (`spend`) |
| `buyRealEstate` | `serverState.js:454` | nessuna | nessuno | no |
| `buyRegion` | `engine.js:1697` | `buyRegion` (`ui-ops.js`) | nessuno | no |
| `buyStandardFuel` | `engine-fleet.js:88` | nessuna | nessuno | no |
| `buyStocks` | `engine-finance.js:250` | nessuna | nessuno | CE_money (`spend`) |
| `buyTiresForDepot` | `engine-fleet.js:203` | `buyTiresForDepot` (`ui-fleet.js`) | nessuno | CE_money (`spend`) |
| `buyVehicle` | `serverState.js:279` | nessuna | nessuno | RPC (`rpc_buy_vehicle`) |
| `buyVehicleUpgrade` | `serverState.js:392` | nessuna | nessuno | no |
| `buyVipContact` | `serverState.js:525` | nessuna | nessuno | no |
| `calculateInterpolatedPosition` | `map-router.js:107` | nessuna | nessuno | no |
| `calculateInterpolatedPosition` | `map-router.js:142` | nessuna | nessuno | no |
| `cancelListing` | `engine-fleet.js:431` | `cancelListing` (`ui-market.js`) | nessuno | no |
| `cancelP2PListing` | `p2p-market.js:103` | `cancelP2PListing` (`p2p-render.js`) | nessuno | RPC (`rpc_cancel_listing`) |
| `CE_Alert` | `design-system.js:166` | nessuna | nessuno | no |
| `CE_cancelBid` | `contracts.js:276` | `CE_cancelBid` (`contracts.js`) | nessuno | CE_money (`earn`) |
| `CE_Contracts` | `contracts.js:153` | nessuna | nessuno | CE_money (`earn`) |
| `CE_placeBid` | `contracts.js:259` | nessuna | nessuno | CE_money (`spend, earn`) |
| `CE_terminateContract` | `contracts.js:289` | `CE_terminateContract` (`contracts.js`) | nessuno | no |
| `CE_updateBidPreview` | `contracts.js:298` | nessuna | nessuno | no |
| `ceAct` | `events.js:67` | nessuna | nessuno | no |
| `ceAlChatEnter` | `ce-actions.js:104` | `ceAlChatEnter` (`alliances.js`) | nessuno | no |
| `ceAttackTerritory` | `ce-actions.js:44` | `ceAttackTerritory` (`ui-ranking.js`) | nessuno | no |
| `ceBidPreview` | `ce-actions.js:15` | `ceBidPreview` (`contracts.js`) | nessuno | no |
| `ceCareerCta` | `ce-actions.js:67` | `ceCareerCta` (`ui-career.js`) | nessuno | no |
| `ceClick` | `events.js:84` | `ceClick` (`ui-staff.js`) | nessuno | no |
| `ceCloseSelf` | `ce-actions.js:113` | `ceCloseSelf` (`index.html`) | nessuno | no |
| `ceConsorzioContribute` | `ce-actions.js:29` | `ceConsorzioContribute` (`p2p-render.js`) | nessuno | no |
| `ceCountUp` | `motion.js:22` | nessuna | nessuno | no |
| `ceCreateConsorzio` | `ce-actions.js:30` | `ceCreateConsorzio` (`p2p-render.js`) | nessuno | no |
| `ceCreateHolding` | `ce-actions.js:28` | `ceCreateHolding` (`p2p-render.js`) | nessuno | no |
| `ceCryptoDeposit` | `ce-actions.js:22` | `ceCryptoDeposit` (`crypto.js`) | nessuno | no |
| `ceCryptoPreview` | `ce-actions.js:24` | `ceCryptoPreview` (`crypto.js`) | nessuno | no |
| `ceCryptoTrade` | `ce-actions.js:18` | `ceCryptoTrade` (`crypto.js`) | nessuno | no |
| `ceCryptoWithdraw` | `ce-actions.js:23` | `ceCryptoWithdraw` (`crypto.js`) | nessuno | no |
| `ceDonateLobby` | `ce-actions.js:42` | `ceDonateLobby` (`ui-politics.js`) | nessuno | no |
| `ceForgotPassword` | `ce-actions.js:79` | `ceForgotPassword` (`ui-landing.js`) | nessuno | no |
| `ceHoldingContribute` | `ce-actions.js:27` | `ceHoldingContribute` (`p2p-render.js`) | nessuno | no |
| `ceHqBuildConfirm` | `ce-actions.js:54` | `ceHqBuildConfirm` (`hq-visual.js`) | nessuno | no |
| `ceListCar` | `ce-actions.js:50` | `ceListCar` (`ui-staff.js`) | nessuno | no |
| `ceMarkupPreview` | `ce-actions.js:98` | `ceMarkupPreview` (`infrastructure.js`) | nessuno | no |
| `ceNoop` | `ce-actions.js:109` | `ceNoop` (`index.html`) | nessuno | no |
| `cePlaceBid` | `ce-actions.js:14` | `cePlaceBid` (`contracts.js`) | nessuno | no |
| `cePlaceBroker` | `ce-actions.js:37` | `cePlaceBroker` (`ui-finance.js`) | nessuno | no |
| `ceRemove` | `events.js:81` | `ceRemove` (`auctions.js`, `auth.js`, `b2b.js`, `crypto.js`, `driver_skills.js`, `engine.js`, `hq-visual.js`, `ui-career.js`, `ui-landing.js`, `ui-map-utils.js`, `vtk-market.js`) | nessuno | no |
| `ceSetActive` | `events.js:101` | `ceSetActive` (`saveSystem.js`, `ui-finance.js`) | nessuno | no |
| `ceSetAvatar` | `ce-actions.js:51` | `ceSetAvatar` (`ui-staff.js`) | nessuno | no |
| `ceSetBrandColor` | `ce-actions.js:90` | `ceSetBrandColor` (`saveSystem.js`) | nessuno | no |
| `ceSetRender` | `events.js:94` | `ceSetRender` (`tourism.js`, `ui-fleet.js`, `ui-marketing.js`, `vtk-market.js`) | nessuno | no |
| `ceStartAcademy` | `ce-actions.js:61` | `ceStartAcademy` (`ui-map-utils.js`) | nessuno | no |
| `ceStockAction` | `ce-actions.js:33` | `ceStockAction` (`ui-finance.js`) | nessuno | no |
| `ceTargaPresidenziale` | `ce-actions.js:85` | `ceTargaPresidenziale` (`vanity.js`) | nessuno | no |
| `ceThen` | `events.js:87` | `ceThen` (`auctions.js`, `black_ops.js`, `crypto.js`, `tourism.js`, `ui-politics.js`) | nessuno | no |
| `ceToggleFa` | `ce-actions.js:73` | `ceToggleFa` (`ui-help.js`) | nessuno | no |
| `ceTPledge` | `ce-actions.js:101` | `ceTPledge` (`tourism.js`) | nessuno | no |
| `ceVoteDecree` | `ce-actions.js:43` | `ceVoteDecree` (`ui-politics.js`) | nessuno | no |
| `ceVtkSell` | `ce-actions.js:47` | `ceVtkSell` (`vtk-market.js`) | nessuno | no |
| `checkActiveTrips` | `engine-rides.js:917` | nessuna | nessuno | CE_money (`earn`) / RPC (`rpc_pay_majority_dividend, rpc_pay_fuel_levy`) |
| `checkActiveTrips` | `engine-rides.js:994` | nessuna | nessuno | no |
| `checkQuestProgress` | `quests.js:20` | nessuna | nessuno | no |
| `claimDailyOrder` | `daily-orders.js:118` | `claimDailyOrder` (`daily-orders.js`) | nessuno | CE_money (`earnDC, earn, addReputation`) |
| `claimHoldingDividends` | `engine-holding.js:119` | nessuna | nessuno | RPC (`rpc_daily_dividends`) |
| `claimQuestReward` | `quests.js:46` | `claimQuestReward` (`ui-career.js`) | nessuno | CE_money (`earn, earnDC, addReputation`) / RPC (`rpc_award_mission_vtk`) |
| `claimReward` | `serverState.js:319` | nessuna | nessuno | RPC (`rpc_claim_trip_reward`) |
| `closeCareerModal` | `ui-career.js:515` | `closeCareerModal` (`ui-career.js`) | nessuno | no |
| `closeCmdPalette` | `cmd-palette.js:55` | nessuna | nessuno | no |
| `closeGarage3D` | `map-garage.js:123` | `closeGarage3D` (`map-garage.js`) | nessuno | no |
| `closeHub` | `ui-hub.js:25` | `closeHub` (`index.html`) | nessuno | no |
| `closeLbIfBackdrop` | `ui-landing.js:404` | `closeLbIfBackdrop` (`ui-landing.js`) | nessuno | no |
| `closeMapOverlay` | `dispatcher.js:143` | `closeMapOverlay` (`index.html`) | nessuno | no |
| `closeModal` | `vittorio.js:143` | nessuna | nessuno | no |
| `closeModals` | `ui-staff.js:365` | `closeModals` (`index.html`) | nessuno | no |
| `collectBrokerEmail` | `ui-emails.js:16` | `collectBrokerEmail` (`ui-emails.js`) | nessuno | no |
| `collectDailyCosts` | `serverState.js:491` | nessuna | nessuno | no |
| `completeMissionRun` | `quests.js:7` | nessuna | nessuno | no |
| `completeRide` | `engine-rides.js:589` | nessuna | nessuno | CE_money (`addReputation, earn, earnDC`) / RPC (`rpc_pay_majority_dividend, rpc_pay_fuel_levy`) |
| `completeRide` | `engine-rides.js:993` | nessuna | nessuno | no |
| `confirmLease` | `engine.js:1624` | `confirmLease` (`index.html`) | nessuno | no |
| `contestFine` | `engine.js:1323` | `contestFine` (`ui-legal.js`) | nessuno | no |
| `contributeConsorzio` | `p2p-render.js:414` | nessuna | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_contribute_consorzio`) |
| `contributeHoldingTreasury` | `p2p-market.js:190` | nessuna | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_contribute_holding_treasury`) |
| `coverShort` | `engine-finance.js:365` | nessuna | nessuno | CE_money (`earn`) |
| `createConsorzio` | `p2p-render.js:387` | nessuna | nessuno | RPC (`rpc_create_consorzio`) |
| `createHolding` | `p2p-market.js:161` | nessuna | nessuno | RPC (`rpc_create_holding`) |
| `cryptoBuy` | `crypto.js:65` | nessuna | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_crypto`) |
| `cryptoDepositOffshore` | `crypto.js:99` | nessuna | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_deposit_offshore`) |
| `cryptoInit` | `crypto.js:327` | nessuna | nessuno | no |
| `cryptoOpenTradeModal` | `crypto.js:144` | `cryptoOpenTradeModal` (`crypto.js`) | nessuno | no |
| `cryptoRefresh` | `crypto.js:45` | nessuna | nessuno | RPC (`rpc_get_crypto_portfolio`) |
| `cryptoSell` | `crypto.js:82` | nessuna | nessuno | CE_money (`accreditatoDalServer`) / RPC (`rpc_sell_crypto`) |
| `cryptoWithdrawOffshore` | `crypto.js:118` | nessuna | nessuno | CE_money (`accreditatoDalServer`) / RPC (`rpc_withdraw_offshore`) |
| `currentObjective` | `objective-tracker.js:53` | nessuna | nessuno | no |
| `dailyTick` | `vittorio.js:54` | nessuna | nessuno | no |
| `decreesRefresh` | `ui-lifestyle.js:142` | nessuna | nessuno | RPC (`rpc_get_server_decrees, rpc_get_active_decrees`) |
| `deleteSlot` | `saveSystem.js:261` | nessuna | nessuno | no |
| `dispatch` | `events.js:28` | nessuna | nessuno | no |
| `divestSubsidiary` | `engine-holding.js:51` | `divestSubsidiary` (`ui-investments.js`) | nessuno | CE_money (`earn`) |
| `divestVentureStake` | `engine-finance.js:446` | `divestVentureStake` (`ui-investments.js`) | nessuno | CE_money (`earn`) |
| `doAcquireProvince` | `ui-ops.js:249` | `doAcquireProvince` (`ui-ops.js`) | nessuno | no |
| `doBuyRealEstate` | `ui-realestate.js:170` | `doBuyRealEstate` (`ui-realestate.js`) | nessuno | no |
| `donateToLobby` | `engine-finance.js:390` | nessuna | nessuno | CE_money (`spend`) |
| `drawCantiereMarker` | `map.js:444` | nessuna | nessuno | no |
| `drawHighways` | `map.js:375` | nessuna | nessuno | no |
| `drawPOIs` | `map.js:395` | nessuna | nessuno | no |
| `driverAllEffects` | `driver_skills.js:117` | nessuna | nessuno | no |
| `driverAwardSkillPoint` | `driver_skills.js:134` | nessuna | nessuno | no |
| `driverHasSkill` | `driver_skills.js:97` | nessuna | nessuno | no |
| `driverPermadeathRoll` | `driver_skills.js:197` | nessuna | nessuno | no |
| `driverSelectBranch` | `driver_skills.js:141` | `driverSelectBranch` (`driver_skills.js`) | nessuno | no |
| `driverSkillEffect` | `driver_skills.js:101` | nessuna | nessuno | no |
| `driverSkillsInit` | `driver_skills.js:328` | nessuna | nessuno | no |
| `driverSkillTree` | `driver_skills.js:92` | nessuna | nessuno | no |
| `driverUnlockSkill` | `driver_skills.js:158` | `driverUnlockSkill` (`driver_skills.js`) | nessuno | no |
| `earlyGates` | `objective-tracker.js:34` | nessuna | nessuno | no |
| `earn` | `money.js:56` | nessuna | nessuno | no |
| `earnDC` | `money.js:143` | nessuna | nessuno | no |
| `emergencyRefuel` | `engine-fleet.js:173` | `emergencyRefuel` (`ui-fleet.js`) | nessuno | CE_money (`spend`) |
| `energyBoostDC` | `engine-store.js:65` | `energyBoostDC` (`index.html`, `ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `ensure` | `daily-orders.js:72` | nessuna | nessuno | no |
| `ensureDebt` | `vittorio.js:28` | nessuna | nessuno | no |
| `executeManualDrive` | `zero-to-hero.js:72` | `executeManualDrive` (`zero-to-hero.js`) | nessuno | no |
| `executeSleepInCar` | `zero-to-hero.js:105` | `executeSleepInCar` (`zero-to-hero.js`) | nessuno | no |
| `findServerDriver` | `serverState.js:553` | nessuna | nessuno | no |
| `findServerVehicle` | `serverState.js:550` | nessuna | nessuno | no |
| `fireDriver` | `engine-drivers.js:155` | `fireDriver` (`ui-staff.js`) | `serverState.js:382` | no |
| `fireDriver` | `serverState.js:382` | `fireDriver` (`ui-staff.js`) | `engine-drivers.js:155` | no |
| `fireStaff` | `ui-staff.js:371` | `fireStaff` (`ui-staff.js`) | nessuno | no |
| `flipVittorio` | `vittorio.js:100` | `flipVittorio` (`vittorio.js`) | nessuno | no |
| `flyToHQ` | `ui-map-utils.js:75` | nessuna | nessuno | no |
| `fmt` | `vittorio.js:25` | nessuna | nessuno | no |
| `forceCloudSave` | `saveSystem.js:247` | nessuna | nessuno | no |
| `forceLeaderboardUpdate` | `saveSystem.js:241` | nessuna | nessuno | no |
| `forceSyncFromCloud` | `auth.js:273` | nessuna | nessuno | no |
| `foundCompany` | `engine.js:1660` | nessuna | nessuno | no |
| `fuelBoostDC` | `engine-store.js:38` | `fuelBoostDC` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `fullBundleDC` | `engine-store.js:178` | `fullBundleDC` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `gameLoop` | `engine.js:1007` | nessuna | nessuno | diretto (`gameState.cash =`) |
| `generateContractRide` | `engine-rides.js:151` | nessuna | nessuno | no |
| `generateContractRide` | `engine-rides.js:989` | nessuna | nessuno | no |
| `generateEmailEvent` | `engine-daily.js:981` | nessuna | nessuno | no |
| `generateEmailEvent` | `engine-daily.js:1170` | nessuna | nessuno | no |
| `generatePOIRide` | `engine-rides.js:37` | nessuna | nessuno | no |
| `generatePOIRide` | `engine-rides.js:988` | nessuna | nessuno | no |
| `generateWorldNews` | `engine.js:1140` | nessuna | nessuno | no |
| `getActiveGlobalEvent` | `global_events.js:59` | nessuna | nessuno | no |
| `getCompany` | `serverState.js:543` | nessuna | nessuno | no |
| `getDecreeEffects` | `ui-lifestyle.js:156` | nessuna | nessuno | no |
| `getDepotLevelData` | `engine-fleet.js:168` | nessuna | nessuno | no |
| `getDrivers` | `serverState.js:545` | nessuna | nessuno | no |
| `getFuelPrice` | `serverState.js:459` | nessuna | nessuno | no |
| `getGlobalEventEffects` | `global_events.js:34` | nessuna | nessuno | no |
| `getLang` | `lang.js:154` | nessuna | nessuno | no |
| `getMissionRequires` | `quests.js:15` | nessuna | nessuno | no |
| `getMyInfluence` | `serverState.js:449` | nessuna | nessuno | no |
| `getRealWeatherForProvince` | `weather_real.js:35` | nessuna | nessuno | no |
| `getRouteById` | `routesDB.js:17745` | nessuna | nessuno | no |
| `getRoutesByRegion` | `routesDB.js:17742` | nessuna | nessuno | no |
| `getRw` | `daily-orders.js:98` | nessuna | nessuno | no |
| `getSharedSlotRivals` | `saveSystem.js:62` | nessuna | nessuno | no |
| `getState` | `serverState.js:542` | nessuna | nessuno | no |
| `getTarget` | `daily-orders.js:94` | nessuna | nessuno | no |
| `getTerritorySnapshot` | `serverState.js:445` | nessuna | nessuno | no |
| `getTrips` | `serverState.js:546` | nessuna | nessuno | no |
| `getVehicles` | `serverState.js:544` | nessuna | nessuno | no |
| `globalEventsInit` | `global_events.js:215` | nessuna | nessuno | no |
| `globalEventsRefresh` | `global_events.js:15` | nessuna | nessuno | RPC (`rpc_sync_global_event_status, rpc_get_active_global_events`) |
| `gs` | `objective-tracker.js:15` | nessuna | `vittorio.js:24` | no |
| `gs` | `vittorio.js:24` | nessuna | `objective-tracker.js:15` | no |
| `hasInvestment` | `engine.js:308` | nessuna | nessuno | no |
| `healAllDriversDC` | `engine-store.js:109` | `healAllDriversDC` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `highlightCategory` | `em-chrome.js:11` | nessuna | nessuno | no |
| `hireCrumiri` | `p2p-render.js:439` | `hireCrumiri` (`p2p-render.js`) | nessuno | RPC (`rpc_hire_crumiri`) |
| `hireDriver` | `engine-drivers.js:133` | `hireDriver` (`events.js`, `ui-staff.js`) | `serverState.js:379` | CE_money (`spend`) |
| `hireDriver` | `serverState.js:379` | `hireDriver` (`events.js`, `ui-staff.js`) | `engine-drivers.js:133` | no |
| `hireNeighborhoodKid` | `zero-to-hero.js:145` | `hireNeighborhoodKid` (`ui-staff.js`) | nessuno | no |
| `hireOfficeStaff` | `ui-staff.js:381` | `hireOfficeStaff` (`ui-staff.js`) | nessuno | no |
| `hook` | `objective-tracker.js:143` | nessuna | nessuno | no |
| `hookDaily` | `vittorio.js:149` | nessuna | nessuno | no |
| `hqAllEffects` | `hq.js:82` | nessuna | nessuno | no |
| `hqGetCityRooms` | `hq.js:66` | nessuna | nessuno | no |
| `hqGetRoomLevel` | `hq.js:76` | nessuna | nessuno | no |
| `hqHasRoomInCity` | `hq.js:71` | nessuna | nessuno | no |
| `hqInit` | `hq.js:23` | nessuna | nessuno | no |
| `hqOpenBuildModalSlot` | `hq-visual.js:87` | `hqOpenBuildModalSlot` (`hq-visual.js`) | nessuno | no |
| `hqShowInfoPanel` | `hq-visual.js:138` | `hqShowInfoPanel` (`hq-visual.js`) | nessuno | no |
| `hqSwitchCity` | `hq.js:197` | `hqSwitchCity` (`hq.js`) | nessuno | no |
| `hqUpgradeRoom` | `hq.js:116` | `hqUpgradeRoom` (`hq.js`) | nessuno | CE_money (`spend, addReputation`) |
| `hubNavigate` | `ui-hub.js:32` | `hubNavigate` (`index.html`, `nemesis.js`, `ui-fleet.js`) | nessuno | no |
| `incorporateHolding` | `engine-holding.js:20` | `incorporateHolding` (`ui-investments.js`) | nessuno | CE_money (`spend`) |
| `init` | `serverState.js:27` | nessuna | nessuno | no |
| `initCompany` | `serverState.js:264` | nessuna | nessuno | RPC (`rpc_init_company`) |
| `initGame` | `engine.js:840` | nessuna | nessuno | diretto (`gameState.cash =`) |
| `initMap` | `map.js:36` | nessuna | nessuno | no |
| `initOffsetSync` | `em-chrome.js:61` | nessuna | nessuno | no |
| `injectStyle` | `objective-tracker.js:82` | nessuna | nessuno | no |
| `instaHealDC` | `engine-store.js:76` | nessuna | nessuno | CE_money (`spendDC`) |
| `instantRepairDC` | `engine-fleet.js:73` | `instantRepairDC` (`ui-staff.js`) | nessuno | CE_money (`spendDC`) |
| `isReady` | `serverState.js:547` | nessuna | nessuno | no |
| `isVeniceIslandHotel` | `routesDB.js:17748` | nessuna | nessuno | no |
| `joinConsorzio` | `p2p-render.js:396` | `joinConsorzio` (`p2p-render.js`) | nessuno | RPC (`rpc_join_consorzio`) |
| `joinHolding` | `p2p-market.js:172` | `joinHolding` (`p2p-render.js`) | nessuno | RPC (`rpc_join_holding`) |
| `leaveConsorzio` | `p2p-render.js:405` | `leaveConsorzio` (`p2p-render.js`) | nessuno | RPC (`rpc_leave_consorzio`) |
| `leaveHolding` | `p2p-market.js:181` | `leaveHolding` (`p2p-render.js`) | nessuno | RPC (`rpc_leave_holding`) |
| `listCarForSale` | `engine-fleet.js:414` | `listCarForSale` (`ui-market.js`) | `p2p-market.js:60` | no |
| `listCarForSale` | `p2p-market.js:60` | `listCarForSale` (`ui-market.js`) | `engine-fleet.js:414` | RPC (`rpc_list_car_for_sale`) |
| `listCompanyIPO` | `p2p-market.js:231` | `listCompanyIPO` (`ui-finance.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_list_company_ipo`) |
| `loadExistingSlot` | `saveSystem.js:399` | nessuna | nessuno | no |
| `loadGame` | `engine.js:473` | nessuna | nessuno | no |
| `loadReal` | `world-feed.js:83` | nessuna | nessuno | no |
| `logToMap` | `engine.js:1130` | nessuna | nessuno | no |
| `mapReal` | `world-feed.js:55` | nessuna | nessuno | no |
| `mount` | `objective-tracker.js:113` | nessuna | nessuno | no |
| `nag` | `vittorio.js:48` | nessuna | nessuno | no |
| `nDrivers` | `objective-tracker.js:17` | nessuna | nessuno | no |
| `negotiateEmail` | `engine-daily.js:1026` | `negotiateEmail` (`ui-emails.js`) | nessuno | CE_money (`spend, addReputation, earn`) |
| `negotiateEmail` | `engine-daily.js:1172` | `negotiateEmail` (`ui-emails.js`) | nessuno | no |
| `newGamePlus` | `engine.js:1825` | `newGamePlus` (`ui-ranking.js`) | nessuno | no |
| `nextGate` | `objective-tracker.js:46` | nessuna | nessuno | no |
| `nFleet` | `objective-tracker.js:18` | nessuna | nessuno | no |
| `npcEvent` | `world-feed.js:37` | nessuna | nessuno | no |
| `onerror` | `boot.js:6` | nessuna | nessuno | no |
| `onlineCount` | `world-feed.js:119` | nessuna | nessuno | no |
| `openAcademyModal` | `ui-map-utils.js:133` | `openAcademyModal` (`ui-staff.js`) | nessuno | no |
| `openCareerModal` | `ui-career.js:495` | nessuna | nessuno | no |
| `openCarModal` | `ui-staff.js:275` | `openCarModal` (`ui-fleet.js`) | nessuno | no |
| `openCmdPalette` | `cmd-palette.js:30` | `openCmdPalette` (`index.html`) | nessuno | no |
| `openGarage3D` | `map-garage.js:10` | `openGarage3D` (`ui-staff.js`) | nessuno | no |
| `openHotelModal` | `engine.js:2070` | `openHotelModal` (`index.html`) | nessuno | no |
| `openHub` | `ui-hub.js:13` | nessuna | nessuno | no |
| `openLeasingModal` | `engine.js:2075` | nessuna | nessuno | no |
| `openMapOverlay` | `dispatcher.js:135` | `openMapOverlay` (`ui-dispatch.js`) | nessuno | no |
| `openModal` | `vittorio.js:117` | nessuna | nessuno | no |
| `openShowcase` | `ui-landing.js:380` | `openShowcase` (`ui-landing.js`) | nessuno | no |
| `openVittorioModal` | `vittorio.js:116` | nessuna | nessuno | no |
| `openVTKModal` | `vtk-market.js:238` | `openVTKModal` (`index.html`) | nessuno | no |
| `opsBundleDC` | `engine-store.js:163` | `opsBundleDC` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `p2pFetchConsorzi` | `p2p-market.js:369` | nessuna | nessuno | no |
| `p2pFetchGdfRisk` | `p2p-market.js:415` | nessuna | nessuno | RPC (`rpc_get_gdf_risk`) |
| `p2pFetchHoldings` | `p2p-market.js:345` | nessuna | nessuno | no |
| `p2pFetchMarket` | `p2p-market.js:310` | nessuna | nessuno | no |
| `p2pFetchShares` | `p2p-market.js:325` | nessuna | nessuno | no |
| `p2pFetchTension` | `p2p-market.js:400` | nessuna | nessuno | RPC (`rpc_tick_tension`) |
| `p2pInit` | `p2p-render.js:478` | nessuna | nessuno | no |
| `p2pRefreshAll` | `p2p-market.js:445` | nessuna | nessuno | no |
| `p2pStartRealtime` | `p2p-market.js:464` | nessuna | nessuno | no |
| `parseArgs` | `events.js:21` | nessuna | nessuno | no |
| `passLobbyLaw` | `engine-finance.js:402` | `passLobbyLaw` (`ui-politics.js`) | nessuno | CE_money (`spend`) |
| `payDonCarmine` | `p2p-render.js:451` | `payDonCarmine` (`p2p-render.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_pay_don_carmine`) |
| `payDriverBonus` | `engine-drivers.js:38` | `payDriverBonus` (`ui-staff.js`) | nessuno | CE_money (`spend`) |
| `payFine` | `engine.js:1312` | `payFine` (`ui-legal.js`) | nessuno | CE_money (`spend`) |
| `payStressClear` | `engine-drivers.js:53` | `payStressClear` (`ui-staff.js`) | nessuno | CE_money (`spend`) |
| `payToRepairCar` | `engine.js:1523` | `payToRepairCar` (`ui-fleet.js`, `ui-staff.js`) | nessuno | no |
| `phase` | `onboarding-core.js:51` | nessuna | nessuno | no |
| `placeBrokerInvestment` | `engine-finance.js:290` | nessuna | nessuno | CE_money (`spend`) |
| `prestige` | `objective-tracker.js:19` | nessuna | `onboarding-core.js:48` | no |
| `prestige` | `onboarding-core.js:48` | nessuna | `objective-tracker.js:19` | no |
| `processDailyRoutines` | `engine-daily.js:315` | nessuna | `vittorio.js:153` | CE_money (`earn, addReputation, earnDC`) |
| `processDailyRoutines` | `engine-daily.js:1169` | nessuna | `vittorio.js:153` | no |
| `processDailyRoutines` | `vittorio.js:153` | nessuna | `engine-daily.js:315`, `engine-daily.js:1169` | no |
| `progressOf` | `daily-orders.js:102` | nessuna | nessuno | no |
| `pushLeaderboardNow` | `saveSystem.js:237` | nessuna | nessuno | no |
| `putDriverOnBreak` | `engine-drivers.js:23` | `putDriverOnBreak` (`ui-staff.js`) | nessuno | no |
| `realWeatherInit` | `weather_real.js:145` | nessuna | nessuno | no |
| `realWeatherRefresh` | `weather_real.js:15` | nessuna | nessuno | RPC (`rpc_get_real_weather`) |
| `refillCarTires` | `serverState.js:477` | nessuna | nessuno | no |
| `refillTires` | `engine-fleet.js:30` | nessuna | nessuno | no |
| `refillVehicle` | `engine-daily.js:218` | nessuna | nessuno | no |
| `refillVehicle` | `engine-daily.js:1173` | nessuna | nessuno | no |
| `refresh` | `vittorio.js:146` | nessuna | nessuno | no |
| `refuelVehicle` | `serverState.js:402` | nessuna | nessuno | no |
| `removeCantiereMarker` | `map.js:455` | nessuna | nessuno | no |
| `removeCheckpointMarker` | `map.js:485` | nessuna | nessuno | no |
| `render` | `motion.js:26` | nessuna | nessuno | no |
| `renderBarometroWidget` | `p2p-render.js:195` | nessuna | nessuno | no |
| `renderConflictHTML` | `world-feed.js:155` | nessuna | nessuno | no |
| `renderCurrentTab` | `ui-help.js:79` | nessuna | nessuno | no |
| `renderDailyOrdersHTML` | `daily-orders.js:172` | nessuna | nessuno | no |
| `renderDriverSkillModal` | `driver_skills.js:238` | `renderDriverSkillModal` (`ui-staff.js`) | nessuno | no |
| `renderGlobalEventPanel` | `global_events.js:163` | nessuna | nessuno | no |
| `renderHQCampus` | `hq-visual.js:7` | nessuna | nessuno | no |
| `renderIspettoratoSection` | `p2p-render.js:313` | nessuna | nessuno | no |
| `renderManualSurvivalMode` | `zero-to-hero.js:41` | nessuna | nessuno | no |
| `renderObjectiveTracker` | `objective-tracker.js:123` | nessuna | nessuno | no |
| `renderOnboardingHTML` | `onboarding.js:38` | nessuna | nessuno | no |
| `renderP2PConsorziSection` | `p2p-render.js:229` | nessuna | nessuno | no |
| `renderP2PHoldingsSection` | `p2p-render.js:128` | nessuna | nessuno | no |
| `renderP2PMarketSection` | `p2p-render.js:13` | nessuna | nessuno | no |
| `renderP2PSharesSection` | `p2p-render.js:74` | nessuna | nessuno | no |
| `renderRealWeatherPanel` | `weather_real.js:92` | nessuna | nessuno | no |
| `renderTabAuctions` | `auctions.js:313` | nessuna | nessuno | no |
| `renderTabB2B` | `b2b.js:296` | nessuna | nessuno | no |
| `renderTabB2B` | `b2b.js:442` | nessuna | nessuno | no |
| `renderTabCareer` | `ui-career.js:527` | nessuna | nessuno | no |
| `renderTabConsorzi` | `alliances.js:57` | nessuna | nessuno | no |
| `renderTabContracts` | `contracts.js:311` | nessuna | nessuno | no |
| `renderTabCorse` | `ui-dispatch.js:4` | nessuna | nessuno | no |
| `renderTabCorse` | `ui-dispatch.js:307` | nessuna | nessuno | no |
| `renderTabCrypto` | `crypto.js:210` | nessuna | nessuno | no |
| `renderTabEmails` | `ui-emails.js:26` | nessuna | nessuno | no |
| `renderTabFinance` | `ui-finance.js:12` | nessuna | nessuno | no |
| `renderTabFinance` | `ui-finance.js:447` | nessuna | nessuno | no |
| `renderTabFleet` | `ui-fleet.js:4` | nessuna | nessuno | no |
| `renderTabFleet` | `ui-fleet.js:421` | nessuna | nessuno | no |
| `renderTabHelp` | `ui-help.js:6` | nessuna | nessuno | no |
| `renderTabHelp` | `ui-help.js:77` | nessuna | nessuno | no |
| `renderTabHome` | `ui-home.js:134` | nessuna | nessuno | no |
| `renderTabHQ` | `hq.js:204` | nessuna | nessuno | no |
| `renderTabInfrastructure` | `infrastructure.js:14` | nessuna | nessuno | RPC (`rpc_get_fuel_depots`) |
| `renderTabInvestments` | `ui-investments.js:5` | nessuna | nessuno | no |
| `renderTabInvestments` | `ui-investments.js:257` | nessuna | nessuno | no |
| `renderTabLegal` | `ui-legal.js:6` | nessuna | nessuno | no |
| `renderTabLegal` | `ui-legal.js:103` | nessuna | nessuno | no |
| `renderTabLifestyle` | `ui-lifestyle.js:5` | nessuna | nessuno | no |
| `renderTabLifestyle` | `ui-lifestyle.js:137` | nessuna | nessuno | no |
| `renderTabLockHTML` | `onboarding.js:18` | nessuna | nessuno | no |
| `renderTabMarket` | `ui-market.js:5` | nessuna | nessuno | no |
| `renderTabMarket` | `ui-market.js:167` | nessuna | nessuno | no |
| `renderTabMarketing` | `ui-marketing.js:8` | nessuna | nessuno | no |
| `renderTabMarketing` | `ui-marketing.js:333` | nessuna | nessuno | no |
| `renderTabNemesis` | `nemesis.js:130` | nessuna | nessuno | no |
| `renderTabOPA` | `hostile_takeover.js:6` | nessuna | nessuno | no |
| `renderTabPolitics` | `ui-politics.js:5` | nessuna | nessuno | no |
| `renderTabPolitics` | `ui-politics.js:108` | nessuna | nessuno | no |
| `renderTabPremiumStore` | `ui-store.js:10` | nessuna | nessuno | no |
| `renderTabPremiumStore` | `ui-store.js:259` | nessuna | nessuno | CE_money (`earnDC`) |
| `renderTabPrestigio` | `vanity.js:45` | nessuna | nessuno | no |
| `renderTabProvinces` | `ui-ops.js:88` | nessuna | nessuno | no |
| `renderTabProvinces` | `ui-ops.js:264` | nessuna | nessuno | no |
| `renderTabRanking` | `ui-ranking.js:4` | `renderTabRanking` (`ui-ranking.js`) | nessuno | no |
| `renderTabRanking` | `ui-ranking.js:272` | `renderTabRanking` (`ui-ranking.js`) | nessuno | no |
| `renderTabRealEstate` | `ui-realestate.js:29` | nessuna | nessuno | no |
| `renderTabRealEstate` | `ui-realestate.js:168` | nessuna | nessuno | no |
| `renderTabRegions` | `ui-ops.js:4` | nessuna | nessuno | no |
| `renderTabRegions` | `ui-ops.js:263` | nessuna | nessuno | no |
| `renderTabShadow` | `black_ops.js:189` | nessuna | nessuno | no |
| `renderTabShowroom` | `showroom.js:311` | nessuna | nessuno | no |
| `renderTabStaff` | `ui-staff.js:12` | nessuna | nessuno | no |
| `renderTabStaff` | `ui-staff.js:400` | nessuna | nessuno | no |
| `renderTabTourism` | `tourism.js:210` | nessuna | nessuno | no |
| `renderTabWarRoom` | `war_room.js:240` | nessuna | nessuno | no |
| `renderTabWarRoom` | `war_room.js:494` | nessuna | nessuno | no |
| `renderVTKModal` | `vtk-market.js:253` | nessuna | nessuno | no |
| `renderWorldFeedHTML` | `world-feed.js:140` | nessuna | nessuno | no |
| `repairCostFor` | `engine.js:1492` | nessuna | nessuno | no |
| `repairEngine` | `engine-fleet.js:55` | `repairEngine` (`ui-fleet.js`) | nessuno | no |
| `repairVehicle` | `serverState.js:407` | nessuna | nessuno | no |
| `repayLoan` | `engine-finance.js:207` | `repayLoan` (`ui-finance.js`, `ui-investments.js`) | `serverState.js:427` | CE_money (`spend`) |
| `repayLoan` | `serverState.js:427` | `repayLoan` (`ui-finance.js`, `ui-investments.js`) | `engine-finance.js:207` | no |
| `repayVittorio` | `vittorio.js:72` | `repayVittorio` (`vittorio.js`) | nessuno | no |
| `resetGame` | `engine.js:697` | nessuna | `saveSystem.js:362` | no |
| `resetGame` | `saveSystem.js:362` | nessuna | `engine.js:697` | no |
| `resolveCoords` | `geoCoords.js:443` | nessuna | nessuno | no |
| `resolveCoords` | `geoCoords.js:502` | nessuna | nessuno | no |
| `resolveEmail` | `ui-emails.js:11` | `resolveEmail` (`ui-emails.js`) | nessuno | no |
| `resolveStrike` | `engine-drivers.js:69` | `resolveStrike` (`ui-staff.js`) | nessuno | CE_money (`spend`) |
| `respondPoaching` | `engine.js:1444` | `respondPoaching` (`ui-emails.js`) | nessuno | no |
| `rest` | `engine.js:1646` | `rest` (`index.html`) | nessuno | no |
| `restCeo` | `serverState.js:486` | nessuna | nessuno | no |
| `restricted` | `onboarding-core.js:60` | nessuna | nessuno | no |
| `returnToHub` | `engine-fleet.js:255` | nessuna | nessuno | CE_money (`spend`) |
| `rides` | `objective-tracker.js:16` | nessuna | `onboarding-core.js:47` | no |
| `rides` | `onboarding-core.js:47` | nessuna | `objective-tracker.js:16` | no |
| `rwLabel` | `daily-orders.js:111` | nessuna | nessuno | no |
| `saveCurrentSlot` | `saveSystem.js:88` | nessuna | nessuno | no |
| `saveGame` | `engine.js:464` | nessuna | nessuno | no |
| `schedeSpente` | `feature-gate.js:27` | nessuna | nessuno | no |
| `scheduleSync` | `em-chrome.js:51` | nessuna | nessuno | no |
| `sellCar` | `engine.js:1563` | `sellCar` (`ui-staff.js`) | nessuno | no |
| `sellCempShares` | `engine-holding.js:78` | `sellCempShares` (`ui-finance.js`) | nessuno | CE_money (`earn`) |
| `sellCompanyNGP` | `engine.js:1880` | `sellCompanyNGP` (`ui-finance.js`) | nessuno | no |
| `sellCompanyShares` | `p2p-market.js:291` | `sellCompanyShares` (`p2p-render.js`) | nessuno | CE_money (`accreditatoDalServer`) / RPC (`rpc_sell_company_shares`) |
| `sellHub` | `engine-fleet.js:399` | `sellHub` (`ui-fleet.js`) | nessuno | CE_money (`earn`) |
| `sellInvestment` | `engine.js:1776` | `sellInvestment` (`ui-investments.js`) | nessuno | CE_money (`earn`) |
| `sellStocks` | `engine-finance.js:268` | nessuna | nessuno | CE_money (`earn`) |
| `sellVehicle` | `serverState.js:472` | nessuna | nessuno | no |
| `sendDriverToRest` | `engine-drivers.js:12` | `sendDriverToRest` (`ui-dispatch.js`) | nessuno | no |
| `ServerState` | `serverState.js:13` | nessuna | nessuno | RPC (`rpc_init_company, rpc_buy_vehicle, rpc_start_trip, rpc_claim_trip_reward`) / diretto (`gameState.cash +=, gameState.cash   =, gameState.driverCoins           =, gameState.vtkBalance            =`) |
| `ServerState` | `serverState.js:633` | nessuna | nessuno | diretto (`gameState.cash -=`) |
| `setDriverAvatar` | `engine-drivers.js:171` | nessuna | nessuno | no |
| `setInboxTab` | `ui-emails.js:10` | `setInboxTab` (`ui-emails.js`) | nessuno | no |
| `setLang` | `lang.js:156` | nessuna | nessuno | no |
| `setPricingStrategy` | `engine-fleet.js:302` | `setPricingStrategy` (`ui-marketing.js`) | nessuno | no |
| `setupDragAndDrop` | `ui-dispatch.js:234` | nessuna | nessuno | no |
| `setupDragAndDrop` | `ui-dispatch.js:308` | nessuna | nessuno | no |
| `shadowExecuteOp` | `black_ops.js:102` | `shadowExecuteOp` (`black_ops.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_execute_shadow_op`) |
| `shadowInit` | `black_ops.js:273` | nessuna | nessuno | no |
| `shadowRefresh` | `black_ops.js:88` | nessuna | nessuno | RPC (`rpc_get_shadow_targets, rpc_get_shadow_ops_log`) |
| `shadowUpgradeDefense` | `black_ops.js:160` | `shadowUpgradeDefense` (`black_ops.js`) | nessuno | CE_money (`addebitatoDalServer`) / RPC (`rpc_upgrade_shadow_defense`) |
| `shortSell` | `engine-finance.js:341` | nessuna | nessuno | CE_money (`spend`) |
| `showBigEvent` | `engine.js:402` | nessuna | nessuno | no |
| `showBigEvent` | `engine.js:420` | nessuna | nessuno | no |
| `showNewGameSetup` | `saveSystem.js:351` | nessuna | nessuno | no |
| `showNotification` | `engine.js:86` | nessuna | nessuno | no |
| `skipAcademyTraining` | `engine-drivers.js:116` | nessuna | nessuno | CE_money (`spendDC`) |
| `skipAllAcademyDC` | `engine-store.js:127` | `skipAllAcademyDC` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `skipAllConstructionsDC` | `engine-store.js:147` | `skipAllConstructionsDC` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `skipConstruction` | `engine-store.js:22` | nessuna | nessuno | CE_money (`spendDC`) |
| `spawnMoneyParticles` | `ui-map-utils.js:8` | nessuna | nessuno | no |
| `speedUpConstruction` | `engine.js:1756` | `speedUpConstruction` (`ui-investments.js`) | nessuno | CE_money (`spendDC`) |
| `spend` | `money.js:43` | nessuna | nessuno | no |
| `spendDC` | `money.js:114` | nessuna | nessuno | no |
| `spendDriverCoins` | `serverState.js:531` | nessuna | nessuno | no |
| `startAcademyCourse` | `engine-drivers.js:94` | nessuna | nessuno | CE_money (`spend`) |
| `startCampaign` | `serverState.js:412` | nessuna | nessuno | no |
| `startMissionRun` | `ui-career.js:534` | `startMissionRun` (`ui-career.js`) | nessuno | no |
| `startNewGameSlot` | `saveSystem.js:398` | nessuna | nessuno | no |
| `startNextRide` | `engine-rides.js:414` | nessuna | nessuno | no |
| `startNextRide` | `engine-rides.js:992` | nessuna | nessuno | no |
| `startNPC` | `world-feed.js:109` | nessuna | nessuno | no |
| `startTrip` | `serverState.js:298` | nessuna | nessuno | RPC (`rpc_start_trip`) |
| `startTutorial` | `tutorial.js:117` | nessuna | nessuno | no |
| `step` | `motion.js:37` | nessuna | nessuno | no |
| `stopCampaign` | `serverState.js:415` | nessuna | nessuno | no |
| `superchargeVehicle` | `engine-fleet.js:13` | nessuna | nessuno | no |
| `switchTab` | `dispatcher.js:150` | `switchTab` (`index.html`, `onboarding.js`, `ui-finance.js`, `ui-home.js`, `vanity.js`, `world-feed.js`) | `em-chrome.js:32`, `motion.js:164`, `premium-ui.js:12`, `ui-sidebar.js:64`, `zero-to-hero.js:182` | no |
| `switchTab` | `em-chrome.js:32` | `switchTab` (`index.html`, `onboarding.js`, `ui-finance.js`, `ui-home.js`, `vanity.js`, `world-feed.js`) | `dispatcher.js:150`, `motion.js:164`, `premium-ui.js:12`, `ui-sidebar.js:64`, `zero-to-hero.js:182` | no |
| `switchTab` | `motion.js:164` | `switchTab` (`index.html`, `onboarding.js`, `ui-finance.js`, `ui-home.js`, `vanity.js`, `world-feed.js`) | `dispatcher.js:150`, `em-chrome.js:32`, `premium-ui.js:12`, `ui-sidebar.js:64`, `zero-to-hero.js:182` | no |
| `switchTab` | `premium-ui.js:12` | `switchTab` (`index.html`, `onboarding.js`, `ui-finance.js`, `ui-home.js`, `vanity.js`, `world-feed.js`) | `dispatcher.js:150`, `em-chrome.js:32`, `motion.js:164`, `ui-sidebar.js:64`, `zero-to-hero.js:182` | no |
| `switchTab` | `ui-sidebar.js:64` | `switchTab` (`index.html`, `onboarding.js`, `ui-finance.js`, `ui-home.js`, `vanity.js`, `world-feed.js`) | `dispatcher.js:150`, `em-chrome.js:32`, `motion.js:164`, `premium-ui.js:12`, `zero-to-hero.js:182` | no |
| `switchTab` | `zero-to-hero.js:182` | `switchTab` (`index.html`, `onboarding.js`, `ui-finance.js`, `ui-home.js`, `vanity.js`, `world-feed.js`) | `dispatcher.js:150`, `em-chrome.js:32`, `motion.js:164`, `premium-ui.js:12`, `ui-sidebar.js:64` | no |
| `syncCash` | `serverState.js:496` | nessuna | nessuno | no |
| `syncChromeOffset` | `em-chrome.js:42` | nessuna | nessuno | no |
| `syncGlobalEventToGameState` | `global_events.js:72` | nessuna | nessuno | no |
| `t` | `lang.js:150` | nessuna | nessuno | no |
| `tabSpenta` | `config.js:90` | nessuna | nessuno | no |
| `tabUnlock` | `onboarding-core.js:62` | nessuna | nessuno | no |
| `takeLoan` | `engine-finance.js:220` | `takeLoan` (`ui-finance.js`, `ui-investments.js`) | `serverState.js:420` | CE_money (`earn`) |
| `takeLoan` | `serverState.js:420` | `takeLoan` (`ui-finance.js`, `ui-investments.js`) | `engine-finance.js:220` | no |
| `terminateLease` | `engine-fleet.js:337` | nessuna | nessuno | CE_money (`spend`) |
| `toggleBlacklist` | `engine.js:1292` | nessuna | nessuno | no |
| `toggleHub` | `ui-hub.js:6` | nessuna | nessuno | no |
| `togglePanel` | `dispatcher.js:125` | nessuna | nessuno | no |
| `toggleSidebar` | `ui-sidebar.js:92` | `toggleSidebar` (`index.html`) | nessuno | no |
| `toggleTelepass` | `serverState.js:397` | nessuna | nessuno | no |
| `tourismCancelBid` | `tourism.js:120` | `tourismCancelBid` (`tourism.js`) | nessuno | RPC (`rpc_cancel_tourism_bid`) |
| `tourismInit` | `tourism.js:495` | nessuna | nessuno | no |
| `tourismRefresh` | `tourism.js:84` | nessuna | nessuno | RPC (`rpc_get_tourism_tenders`) |
| `tourismSubmitBid` | `tourism.js:99` | `tourismSubmitBid` (`tourism.js`) | nessuno | RPC (`rpc_submit_tourism_bid`) |
| `tourismTerminate` | `tourism.js:129` | `tourismTerminate` (`tourism.js`) | nessuno | CE_money (`addReputation`) / RPC (`rpc_terminate_tourism_contract`) |
| `tpl` | `daily-orders.js:92` | nessuna | nessuno | no |
| `triggerCapitalismEvent` | `zero-to-hero.js:119` | nessuna | nessuno | no |
| `tutorialNext` | `tutorial.js:122` | `tutorialNext` (`tutorial.js`) | nessuno | no |
| `tutorialSkip` | `tutorial.js:129` | `tutorialSkip` (`tutorial.js`) | nessuno | no |
| `unlockRegion` | `serverState.js:432` | nessuna | nessuno | no |
| `updateLeasePreview` | `engine.js:1603` | `updateLeasePreview` (`index.html`) | nessuno | no |
| `updateSidebarStats` | `ui-sidebar.js:71` | nessuna | nessuno | no |
| `updateUI` | `engine.js:2003` | nessuna | `objective-tracker.js:147`, `ui-sidebar.js:85` | no |
| `updateUI` | `objective-tracker.js:147` | nessuna | `engine.js:2003`, `ui-sidebar.js:85` | no |
| `updateUI` | `ui-sidebar.js:85` | nessuna | `engine.js:2003`, `objective-tracker.js:147` | no |
| `upgradeFuelDepot` | `engine-fleet.js:188` | `upgradeFuelDepot` (`ui-fleet.js`) | nessuno | CE_money (`spend`) |
| `upgradeOfflineLimit` | `serverState.js:513` | nessuna | nessuno | no |
| `veteran` | `onboarding-core.js:49` | nessuna | nessuno | no |
| `vipGaranteEventIntimidisci` | `vip-clients.js:576` | `vipGaranteEventIntimidisci` (`ui-emails.js`) | nessuno | CE_money (`spend`) |
| `vipGaranteEventPaga` | `vip-clients.js:562` | `vipGaranteEventPaga` (`ui-emails.js`) | nessuno | CE_money (`spend`) |
| `vipGrigoriEventAccept` | `vip-clients.js:88` | `vipGrigoriEventAccept` (`ui-emails.js`) | nessuno | CE_money (`spend`) |
| `vipGrigoriEventDecline` | `vip-clients.js:100` | `vipGrigoriEventDecline` (`ui-emails.js`) | nessuno | CE_money (`addReputation`) |
| `vipOnorevoleEventCopera` | `vip-clients.js:299` | `vipOnorevoleEventCopera` (`ui-emails.js`) | nessuno | CE_money (`spend`) |
| `vipOnorevoleEventResisti` | `vip-clients.js:315` | `vipOnorevoleEventResisti` (`ui-emails.js`) | nessuno | CE_money (`addReputation`) |
| `vipPlatinumEventAllow` | `vip-clients.js:231` | `vipPlatinumEventAllow` (`ui-emails.js`) | nessuno | CE_money (`addReputation`) |
| `vipPlatinumEventBlock` | `vip-clients.js:220` | `vipPlatinumEventBlock` (`ui-emails.js`) | nessuno | CE_money (`spend`) |
| `vipWeddingEventGestisci` | `vip-clients.js:667` | `vipWeddingEventGestisci` (`ui-emails.js`) | nessuno | CE_money (`spend, earn`) |
| `vipWeddingEventIgnora` | `vip-clients.js:679` | `vipWeddingEventIgnora` (`ui-emails.js`) | nessuno | CE_money (`addReputation`) |
| `vipWeddingPaymentCollect` | `vip-clients.js:688` | `vipWeddingPaymentCollect` (`ui-emails.js`) | nessuno | CE_money (`earn`) |
| `visualLoop` | `map-visual.js:30` | nessuna | nessuno | no |
| `voteServerDecree` | `ui-lifestyle.js:170` | nessuna | nessuno | RPC (`rpc_vote_server_decree`) |
| `vtkBuyShopItem` | `vtk-market.js:179` | `vtkBuyShopItem` (`vtk-market.js`) | nessuno | RPC (`rpc_spend_vtk_shop_item`) |
| `vtkCancelOrder` | `vtk-market.js:148` | `vtkCancelOrder` (`vtk-market.js`) | nessuno | RPC (`rpc_cancel_vtk_order`) |
| `vtkFillOrder` | `vtk-market.js:126` | `vtkFillOrder` (`vtk-market.js`) | nessuno | RPC (`rpc_fill_vtk_order`) |
| `vtkPlaceSellOrder` | `vtk-market.js:98` | nessuna | nessuno | RPC (`rpc_place_vtk_sell_order`) |
| `vtkRefreshOrders` | `vtk-market.js:86` | nessuna | nessuno | RPC (`rpc_get_vtk_market_orders`) |
| `wakeAllDriversDC` | `engine-store.js:95` | `wakeAllDriversDC` (`ui-store.js`) | nessuno | CE_money (`spendDC`) |
| `wakeDriverDC` | `engine-store.js:49` | nessuna | nessuno | CE_money (`spendDC`) |

---

## Funzioni che nessuno chiama

| Funzione | Definizione | Note |
|---|---|---|
| `b2bLockedDriverIds` | `b2b.js:70` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `driverSkillEffect` | `driver_skills.js:101` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_emSyncChromeOffset` | `em-chrome.js:49` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_emHighlightCategory` | `em-chrome.js:81` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `skipAcademyTraining` | `engine-drivers.js:116` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `assignSpecialty` | `engine-drivers.js:185` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `superchargeVehicle` | `engine-fleet.js:13` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `refillTires` | `engine-fleet.js:30` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `buyStandardFuel` | `engine-fleet.js:88` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `buyBlackMarketFuel` | `engine-fleet.js:108` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `getDepotLevelData` | `engine-fleet.js:168` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `returnToHub` | `engine-fleet.js:255` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `applyVehicleSkin` | `engine-fleet.js:323` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `terminateLease` | `engine-fleet.js:337` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_listCompanyIPO_NPC` | `engine-holding.js:93` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `skipConstruction` | `engine-store.js:22` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `wakeDriverDC` | `engine-store.js:49` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `instaHealDC` | `engine-store.js:76` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_getBrandVolumeBonus` | `engine.js:116` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_getBrandPrestigeBonus` | `engine.js:125` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_getPrestige` | `engine.js:1166` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `toggleBlacklist` | `engine.js:1292` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `openLeasingModal` | `engine.js:2075` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `renderGlobalEventPanel` | `global_events.js:163` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `getLang` | `lang.js:154` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `removeCheckpointMarker` | `map.js:485` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_earlyGates` | `objective-tracker.js:44` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_hasFleet` | `quests-data.js:30` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_vehicleOk` | `quests-data.js:34` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_driverOk` | `quests-data.js:45` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `getMissionRequires` | `quests.js:15` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `getRoutesByRegion` | `routesDB.js:17742` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `getRouteById` | `routesDB.js:17745` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `isVeniceIslandHotel` | `routesDB.js:17748` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_getSlotMeta` | `saveSystem.js:27` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_fmtTs` | `saveSystem.js:50` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `getSharedSlotRivals` | `saveSystem.js:62` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `pushLeaderboardNow` | `saveSystem.js:237` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `forceCloudSave` | `saveSystem.js:247` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `startNewGameSlot` | `saveSystem.js:398` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `loadExistingSlot` | `saveSystem.js:399` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_carRewardLine` | `ui-career.js:172` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_updateTrafficLabel` | `ui-dispatch.js:225` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_vanityApplyBrand` | `vanity.js:43` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_vipSyncCash` | `vip-clients.js:18` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `getRealWeatherForProvince` | `weather_real.js:35` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_realWeatherGetTrafficMult` | `weather_real.js:84` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |
| `_veteran` | `zero-to-hero.js:18` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |

---

## Nomi definiti due volte

| Nome | Definizione 1 | Definizione 2 / altre | Note |
|---|---|---|---|
| `_rpc` | `alliances.js:286` | `serverState.js:370` | Definizione locale vs serverState.js |
| `_sb` | `b2b.js:34` | `p2p-market.js:49` | Helper locale / variabile condivisa definita in più file |
| `_uid` | `b2b.js:35` | `p2p-market.js:50` | Helper locale / variabile condivisa definita in più file |
| `switchTab` | `dispatcher.js:150` | `em-chrome.js:32, motion.js:164, premium-ui.js:12, ui-sidebar.js:64, zero-to-hero.js:182` | Decoratore / catena di rendering UI deliberata |
| `switchTab` | `em-chrome.js:32` | `dispatcher.js:150, motion.js:164, premium-ui.js:12, ui-sidebar.js:64, zero-to-hero.js:182` | Decoratore / catena di rendering UI deliberata |
| `processDailyRoutines` | `engine-daily.js:315` | `vittorio.js:153` | Decoratore / catena di rendering UI deliberata |
| `processDailyRoutines` | `engine-daily.js:1169` | `vittorio.js:153` | Decoratore / catena di rendering UI deliberata |
| `hireDriver` | `engine-drivers.js:133` | `serverState.js:379` | Definizione locale vs serverState.js |
| `fireDriver` | `engine-drivers.js:155` | `serverState.js:382` | Definizione locale vs serverState.js |
| `repayLoan` | `engine-finance.js:207` | `serverState.js:427` | Definizione locale vs serverState.js |
| `takeLoan` | `engine-finance.js:220` | `serverState.js:420` | Definizione locale vs serverState.js |
| `listCarForSale` | `engine-fleet.js:414` | `p2p-market.js:60` | P2P market (p2p-market.js) sovrascrive vendita flotta standard (engine-fleet.js) |
| `resetGame` | `engine.js:697` | `saveSystem.js:362` | Decoratore / catena di rendering UI deliberata |
| `buyInvestment` | `engine.js:1717` | `serverState.js:387` | Definizione locale vs serverState.js |
| `updateUI` | `engine.js:2003` | `objective-tracker.js:147, ui-sidebar.js:85` | Decoratore / catena di rendering UI deliberata |
| `_gs` | `money.js:22` | `onboarding-core.js:21` | Helper locale / variabile condivisa definita in più file |
| `switchTab` | `motion.js:164` | `dispatcher.js:150, em-chrome.js:32, premium-ui.js:12, ui-sidebar.js:64, zero-to-hero.js:182` | Decoratore / catena di rendering UI deliberata |
| `gs` | `objective-tracker.js:15` | `vittorio.js:24` | Helper locale / variabile condivisa definita in più file |
| `rides` | `objective-tracker.js:16` | `onboarding-core.js:47` | Helper locale / variabile condivisa definita in più file |
| `prestige` | `objective-tracker.js:19` | `onboarding-core.js:48` | Helper locale / variabile condivisa definita in più file |
| `updateUI` | `objective-tracker.js:147` | `engine.js:2003, ui-sidebar.js:85` | Decoratore / catena di rendering UI deliberata |
| `_gs` | `onboarding-core.js:21` | `money.js:22` | Helper locale / variabile condivisa definita in più file |
| `rides` | `onboarding-core.js:47` | `objective-tracker.js:16` | Helper locale / variabile condivisa definita in più file |
| `prestige` | `onboarding-core.js:48` | `objective-tracker.js:19` | Helper locale / variabile condivisa definita in più file |
| `_rides` | `onboarding.js:14` | `zero-to-hero.js:17` | Helper locale / variabile condivisa definita in più file |
| `_sb` | `p2p-market.js:49` | `b2b.js:34` | Helper locale / variabile condivisa definita in più file |
| `_uid` | `p2p-market.js:50` | `b2b.js:35` | Helper locale / variabile condivisa definita in più file |
| `listCarForSale` | `p2p-market.js:60` | `engine-fleet.js:414` | P2P market (p2p-market.js) sovrascrive vendita flotta standard (engine-fleet.js) |
| `switchTab` | `premium-ui.js:12` | `dispatcher.js:150, em-chrome.js:32, motion.js:164, ui-sidebar.js:64, zero-to-hero.js:182` | Decoratore / catena di rendering UI deliberata |
| `resetGame` | `saveSystem.js:362` | `engine.js:697` | Decoratore / catena di rendering UI deliberata |
| `_save` | `security.js:82` | `vanity.js:160` | Helper locale / variabile condivisa definita in più file |
| `_rpc` | `serverState.js:370` | `alliances.js:286` | Definizione locale vs serverState.js |
| `hireDriver` | `serverState.js:379` | `engine-drivers.js:133` | Definizione locale vs serverState.js |
| `fireDriver` | `serverState.js:382` | `engine-drivers.js:155` | Definizione locale vs serverState.js |
| `buyInvestment` | `serverState.js:387` | `engine.js:1717` | Definizione locale vs serverState.js |
| `takeLoan` | `serverState.js:420` | `engine-finance.js:220` | Definizione locale vs serverState.js |
| `repayLoan` | `serverState.js:427` | `engine-finance.js:207` | Definizione locale vs serverState.js |
| `buyHRAutomation` | `serverState.js:534` | `ui-ops.js:218` | Definizione locale vs serverState.js |
| `_kpi` | `ui-finance.js:87` | `ui-ranking.js:105` | Helper locale / variabile condivisa definita in più file |
| `buyHRAutomation` | `ui-ops.js:218` | `serverState.js:534` | Definizione locale vs serverState.js |
| `_kpi` | `ui-ranking.js:105` | `ui-finance.js:87` | Helper locale / variabile condivisa definita in più file |
| `switchTab` | `ui-sidebar.js:64` | `dispatcher.js:150, em-chrome.js:32, motion.js:164, premium-ui.js:12, zero-to-hero.js:182` | Decoratore / catena di rendering UI deliberata |
| `updateUI` | `ui-sidebar.js:85` | `engine.js:2003, objective-tracker.js:147` | Decoratore / catena di rendering UI deliberata |
| `_save` | `vanity.js:160` | `security.js:82` | Helper locale / variabile condivisa definita in più file |
| `gs` | `vittorio.js:24` | `objective-tracker.js:15` | Helper locale / variabile condivisa definita in più file |
| `processDailyRoutines` | `vittorio.js:153` | `engine-daily.js:315, engine-daily.js:1169` | Decoratore / catena di rendering UI deliberata |
| `_rides` | `zero-to-hero.js:17` | `onboarding.js:14` | Helper locale / variabile condivisa definita in più file |
| `switchTab` | `zero-to-hero.js:182` | `dispatcher.js:150, em-chrome.js:32, motion.js:164, premium-ui.js:12, ui-sidebar.js:64` | Decoratore / catena di rendering UI deliberata |

