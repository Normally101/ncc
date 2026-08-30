# Registro di chiusura — le azioni del giocatore, una per una

> Generato da `npm run registro`. **La colonna CHIUSA si scrive a mano** e viene
> conservata fra una generazione e l'altra: è l'unica memoria del lavoro fatto.
> Il piano che governa questo registro è `PIANO-CHIUSURA.md`.

Aggiornato: 30/08/2026, 22:47:40

| | |
|---|---|
| Azioni totali | **254** |
| Chiuse (provate davvero, con un test che le difende) | **1** |
| Aperte | **253** |
| Difetti trovati e ancora da correggere | **0** |
| Eseguite dal banco automatico (`ok`) | 75 |
| Il banco la esegue ma il denaro si muove altrove (`eseguita`) | 37 |
| Il banco non riesce ad attivarle | 17 |
| Fuori dal banco (file non caricato lì) | 30 |

**Legenda CHIUSA** — ⬜ da fare · ✅ chiusa · 🐛 difetto trovato, correzione aperta · ⏭️ non applicabile (con motivo nelle note)

| Azione | Sistema | File | Banco | Chiusa | Note |
|---|---|---|---|---|---|
| `_alChat` | alliances | alliances.js | — | ⬜ |  |
| `_alCreate` | alliances | alliances.js | ok | ⬜ |  |
| `_alDisband` | alliances | alliances.js | eseguita | ⬜ |  |
| `_alDonate` | alliances | alliances.js | ok | ⬜ |  |
| `_alJoin` | alliances | alliances.js | eseguita | ⬜ |  |
| `_alKick` | alliances | alliances.js | — | ⬜ |  |
| `_alLeave` | alliances | alliances.js | eseguita | ⬜ |  |
| `_alPerk` | alliances | alliances.js | — | ⬜ |  |
| `_alSetRole` | alliances | alliances.js | — | ⬜ |  |
| `auctionsConfirmBid` | auctions | auctions.js | — | ⬜ |  |
| `auctionsOpenBidModal` | auctions | auctions.js | — | ⬜ |  |
| `auctionsRevealWon` | auctions | auctions.js | — | ⬜ |  |
| `switchTab` | auctions | auctions.js | — | ⬜ |  |
| `authLogout` | auth | auth.js | — | ⬜ |  |
| `b2bCheckLimit` | b2b | b2b.js | — | ⬜ |  |
| `b2bConfirmAccept` | b2b | b2b.js | — | ⬜ |  |
| `b2bOpenAcceptModal` | b2b | b2b.js | — | ⬜ |  |
| `b2bTerminateContract` | b2b | b2b.js | eseguita | ⬜ |  |
| `shadowExecuteOp` | black_ops | black_ops.js | stato | ⬜ |  |
| `shadowUpgradeDefense` | black_ops | black_ops.js | ok | ⬜ |  |
| `closeHub` | boot | boot.js | assente | ⬜ |  |
| `closeMapOverlay` | boot | boot.js | assente | ⬜ |  |
| `_applyBivioChoice` | career | ui-career.js | — | ⬜ |  |
| `closeCareerModal` | career | ui-career.js | — | ⬜ |  |
| `startMissionRun` | career | ui-career.js | — | ⬜ |  |
| `_cercaGiocatori` | ce-actions | ce-actions.js | assente | ⬜ |  |
| `ceAlChatEnter` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceAttackTerritory` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceBidPreview` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCareerCta` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCercaGiocatoriEnter` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCloseSelf` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceConsorzioContribute` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCreateConsorzio` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCreateHolding` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCryptoDeposit` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCryptoPreview` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCryptoTrade` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceCryptoWithdraw` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceDonateLobby` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceForgotPassword` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceHoldingContribute` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceHqBuildConfirm` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceListCar` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceListCarP2P` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceMarkupPreview` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceNoop` | ce-actions | ce-actions.js | — | ⬜ |  |
| `cePlaceBid` | ce-actions | ce-actions.js | — | ⬜ |  |
| `cePlaceBroker` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceSetAvatar` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceSetBrandColor` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceStartAcademy` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceStockAction` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceTargaPresidenziale` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceToggleFa` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceTPledge` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceVoteDecree` | ce-actions | ce-actions.js | — | ⬜ |  |
| `ceVtkSell` | ce-actions | ce-actions.js | — | ⬜ |  |
| `openAcademyModal` | ce-actions | ce-actions.js | — | ⬜ |  |
| `openCmdPalette` | cmd-palette | cmd-palette.js | assente | ⬜ |  |
| `CE_cancelBid` | contracts | contracts.js | ok | ⬜ |  |
| `CE_terminateContract` | contracts | contracts.js | — | ⬜ |  |
| `cryptoOpenTradeModal` | crypto | crypto.js | — | ⬜ |  |
| `negotiateEmail` | daily | engine-daily.js | ok | ⬜ |  |
| `claimDailyOrder` | daily-orders | daily-orders.js | stato | ⬜ |  |
| `openMapOverlay` | dispatcher | dispatcher.js | assente | ⬜ |  |
| `driverSelectBranch` | driver_skills | driver_skills.js | — | ⬜ |  |
| `driverUnlockSkill` | driver_skills | driver_skills.js | — | ⬜ |  |
| `renderDriverSkillModal` | driver_skills | driver_skills.js | — | ⬜ |  |
| `fireDriver` | drivers | engine-drivers.js | — | ⬜ |  |
| `hireDriver` | drivers | engine-drivers.js | ok | ⬜ |  |
| `payDriverBonus` | drivers | engine-drivers.js | ok | ⬜ |  |
| `payStressClear` | drivers | engine-drivers.js | ok | ⬜ |  |
| `putDriverOnBreak` | drivers | engine-drivers.js | eseguita | ⬜ |  |
| `resolveStrike` | drivers | engine-drivers.js | ok | ⬜ |  |
| `sendDriverToRest` | drivers | engine-drivers.js | eseguita | ⬜ |  |
| `collectBrokerEmail` | emails | ui-emails.js | assente | ⬜ |  |
| `resolveEmail` | emails | ui-emails.js | assente | ⬜ |  |
| `setInboxTab` | emails | ui-emails.js | assente | ⬜ |  |
| `_applyMarketingCampaign` | engine | engine.js | eseguita | ⬜ |  |
| `_stopMarketingCampaign` | engine | engine.js | — | ⬜ |  |
| `acceptDiamondContract` | engine | engine.js | ok | ⬜ |  |
| `acceptShadowMission` | engine | engine.js | stato | ⬜ |  |
| `assignCarToDriver` | engine | engine.js | — | ⬜ |  |
| `buyInvestment` | engine | engine.js | ok | ⬜ |  |
| `buyRegion` | engine | engine.js | ok | ⬜ |  |
| `confirmLease` | engine | engine.js | — | ⬜ |  |
| `contestFine` | engine | engine.js | — | ⬜ |  |
| `newGamePlus` | engine | engine.js | ok | ⬜ |  |
| `openHotelModal` | engine | engine.js | — | ⬜ |  |
| `payFine` | engine | engine.js | ok | ⬜ |  |
| `payToRepairCar` | engine | engine.js | ok | ⬜ |  |
| `respondPoaching` | engine | engine.js | — | ⬜ |  |
| `rest` | engine | engine.js | ok | ⬜ |  |
| `sellCar` | engine | engine.js | ok | ⬜ |  |
| `sellCompanyNGP` | engine | engine.js | ok | ⬜ |  |
| `sellInvestment` | engine | engine.js | ok | ⬜ |  |
| `speedUpConstruction` | engine | engine.js | ok | ⬜ |  |
| `updateLeasePreview` | engine | engine.js | — | ⬜ |  |
| `ceClick` | events | events.js | — | ⬜ |  |
| `ceRemove` | events | events.js | — | ⬜ |  |
| `ceSetActive` | events | events.js | — | ⬜ |  |
| `ceSetRender` | events | events.js | — | ⬜ |  |
| `ceThen` | events | events.js | — | ⬜ |  |
| `acquireVentureStake` | finance | engine-finance.js | ok | ⬜ |  |
| `buyLifestyleAsset` | finance | engine-finance.js | ok | ⬜ |  |
| `divestVentureStake` | finance | engine-finance.js | ok | ⬜ |  |
| `passLobbyLaw` | finance | engine-finance.js | ok | ⬜ |  |
| `repayLoan` | finance | engine-finance.js | ok | ⬜ |  |
| `takeLoan` | finance | engine-finance.js | ok | ⬜ |  |
| `acceptGreyMarket` | fleet | engine-fleet.js | eseguita | ⬜ |  |
| `bidOnAuction` | fleet | engine-fleet.js | ok | ⬜ |  |
| `bulkRepairFleet` | fleet | ui-fleet.js | — | ⬜ |  |
| `buyCARUpgrade` | fleet | engine-fleet.js | ok | ⬜ |  |
| `buyFuelForDepot` | fleet | engine-fleet.js | ok | ⬜ |  |
| `buyHub` | fleet | engine-fleet.js | ok | ⬜ |  |
| `buyMaintenanceContract` | fleet | engine-fleet.js | ok | ⬜ |  |
| `buyNpcCar` | fleet | engine-fleet.js | ok | ⬜ |  |
| `buyPrototypeCar` | fleet | engine-fleet.js | stato | ⬜ |  |
| `buyTiresForDepot` | fleet | engine-fleet.js | ok | ⬜ |  |
| `cancelListing` | fleet | engine-fleet.js | eseguita | ⬜ |  |
| `chargeVehicle` | fleet | engine-fleet.js | ok | ⬜ |  |
| `emergencyRefuel` | fleet | engine-fleet.js | ok | ⬜ |  |
| `instantRepairDC` | fleet | engine-fleet.js | ok | ⬜ |  |
| `listCarForSale` | fleet | engine-fleet.js | eseguita | ⬜ |  |
| `repairEngine` | fleet | engine-fleet.js | ok | ⬜ |  |
| `sellHub` | fleet | engine-fleet.js | ok | ⬜ |  |
| `setPricingStrategy` | fleet | engine-fleet.js | eseguita | ⬜ |  |
| `upgradeFuelDepot` | fleet | engine-fleet.js | ok | ⬜ |  |
| `acquireSubsidiary` | holding | engine-holding.js | stato | ⬜ |  |
| `buyCempShares` | holding | engine-holding.js | ok | ⬜ |  |
| `divestSubsidiary` | holding | engine-holding.js | stato | ⬜ |  |
| `incorporateHolding` | holding | engine-holding.js | ok | ⬜ |  |
| `sellCempShares` | holding | engine-holding.js | stato | ⬜ |  |
| `_opaRequestBuyback` | hostile_takeover | hostile_takeover.js | ok | ⬜ |  |
| `_hqBuildFromList` | hq | hq.js | — | ⬜ |  |
| `hqSwitchCity` | hq | hq.js | eseguita | ⬜ |  |
| `hqUpgradeRoom` | hq | hq.js | stato | ⬜ |  |
| `hqOpenBuildModalSlot` | hq-visual | hq-visual.js | assente | ⬜ |  |
| `hqShowInfoPanel` | hq-visual | hq-visual.js | assente | ⬜ |  |
| `hubNavigate` | hub | ui-hub.js | assente | ⬜ |  |
| `_infraBuyDepot` | infrastructure | infrastructure.js | ok | ⬜ |  |
| `_infraSetMarkup` | infrastructure | infrastructure.js | — | ⬜ |  |
| `_kbApri` | knowledge-book | knowledge-book.js | — | ⬜ |  |
| `_authLogin` | landing | ui-landing.js | — | ⬜ |  |
| `_authSignup` | landing | ui-landing.js | — | ⬜ |  |
| `closeLbIfBackdrop` | landing | ui-landing.js | — | ⬜ |  |
| `openShowcase` | landing | ui-landing.js | — | ⬜ |  |
| `closeGarage3D` | map-garage | map-garage.js | assente | ⬜ |  |
| `openGarage3D` | map-garage | map-garage.js | assente | ⬜ |  |
| `_mapSbloccaRegione` | map-svg | map-svg.js | assente | ⬜ |  |
| `_academySelectDriver` | map-utils | ui-map-utils.js | assente | ⬜ |  |
| `_cancelFoundingMode` | map-utils | ui-map-utils.js | assente | ⬜ |  |
| `_foundFromRegion` | map-utils | ui-map-utils.js | assente | ⬜ |  |
| `_startFoundingList` | map-utils | ui-map-utils.js | assente | ⬜ |  |
| `_startFoundingMode` | map-utils | ui-map-utils.js | assente | ⬜ |  |
| `_nemesisBribeVip` | nemesis | nemesis.js | stato | ⬜ |  |
| `doAcquireProvince` | ops | ui-ops.js | eseguita | ⬜ |  |
| `buyCompanyShares` | p2p-market | p2p-market.js | stato | ⬜ |  |
| `buyP2PCar` | p2p-market | p2p-market.js | stato | ⬜ |  |
| `cancelP2PListing` | p2p-market | p2p-market.js | eseguita | ✅ | 30/08: l'annuncio scaduto spariva e con lui l'auto. Ora resta ritirabile. |
| `joinHolding` | p2p-market | p2p-market.js | eseguita | ⬜ |  |
| `leaveHolding` | p2p-market | p2p-market.js | eseguita | ⬜ |  |
| `listCompanyIPO` | p2p-market | p2p-market.js | eseguita | ⬜ |  |
| `sellCompanyShares` | p2p-market | p2p-market.js | eseguita | ⬜ |  |
| `hireCrumiri` | p2p-render | p2p-render.js | eseguita | ⬜ |  |
| `joinConsorzio` | p2p-render | p2p-render.js | eseguita | ⬜ |  |
| `leaveConsorzio` | p2p-render | p2p-render.js | eseguita | ⬜ |  |
| `payDonCarmine` | p2p-render | p2p-render.js | ok | ⬜ |  |
| `claimQuestReward` | quests | quests.js | ok | ⬜ |  |
| `renderTabRanking` | ranking | ui-ranking.js | assente | ⬜ |  |
| `doBuyRealEstate` | realestate | ui-realestate.js | eseguita | ⬜ |  |
| `assignAllRides` | rides | engine-rides.js | — | ⬜ |  |
| `_confirmNewGame` | saveSystem | saveSystem.js | — | ⬜ |  |
| `buyHRAutomation` | serverState | serverState.js | ok | ⬜ |  |
| `_srmBackToGallery` | showroom | showroom.js | — | ⬜ |  |
| `_srmClose` | showroom | showroom.js | — | ⬜ |  |
| `_srmFilterBrand` | showroom | showroom.js | — | ⬜ |  |
| `_srmFilterFuel` | showroom | showroom.js | — | ⬜ |  |
| `_srmOpenConfig` | showroom | showroom.js | — | ⬜ |  |
| `_srmPurchase` | showroom | showroom.js | ok | ⬜ |  |
| `_srmRent` | showroom | showroom.js | stato | ⬜ |  |
| `_srmSetSection` | showroom | showroom.js | — | ⬜ |  |
| `_srmToggle` | showroom | showroom.js | — | ⬜ |  |
| `_sidebarToggle` | sidebar | ui-sidebar.js | assente | ⬜ |  |
| `toggleSidebar` | sidebar | ui-sidebar.js | assente | ⬜ |  |
| `_amicoRichiedi` | social | social.js | assente | ⬜ |  |
| `_dmApri` | social | social.js | assente | ⬜ |  |
| `_dmChiudi` | social | social.js | assente | ⬜ |  |
| `_socialVista` | social | social.js | assente | ⬜ |  |
| `closeModals` | staff | ui-staff.js | — | ⬜ |  |
| `fireStaff` | staff | ui-staff.js | — | ⬜ |  |
| `hireOfficeStaff` | staff | ui-staff.js | — | ⬜ |  |
| `openCarModal` | staff | ui-staff.js | — | ⬜ |  |
| `_dcAcquistaPacchetto` | store | ui-store.js | — | ⬜ |  |
| `_dcSpend` | store | ui-store.js | stato | ⬜ |  |
| `_ecCaffeSospeso` | store | ui-store.js | ok | ⬜ |  |
| `_ecManutenzioneExpress` | store | ui-store.js | ok | ⬜ |  |
| `_ecPolizzaKasko` | store | ui-store.js | ok | ⬜ |  |
| `_ecRadarVip` | store | ui-store.js | ok | ⬜ |  |
| `_ecSwitchTab` | store | ui-store.js | stato | ⬜ |  |
| `_ecTangenteSindacato` | store | ui-store.js | ok | ⬜ |  |
| `_ecTargaPresidenziale` | store | ui-store.js | ok | ⬜ |  |
| `activateExecutivePass` | store | engine-store.js | ok | ⬜ |  |
| `energyBoostDC` | store | engine-store.js | ok | ⬜ |  |
| `fuelBoostDC` | store | engine-store.js | ok | ⬜ |  |
| `fullBundleDC` | store | engine-store.js | ok | ⬜ |  |
| `healAllDriversDC` | store | engine-store.js | ok | ⬜ |  |
| `opsBundleDC` | store | engine-store.js | ok | ⬜ |  |
| `skipAllAcademyDC` | store | engine-store.js | ok | ⬜ |  |
| `skipAllConstructionsDC` | store | engine-store.js | ok | ⬜ |  |
| `wakeAllDriversDC` | store | engine-store.js | ok | ⬜ |  |
| `tourismCancelBid` | tourism | tourism.js | eseguita | ⬜ |  |
| `tourismSubmitBid` | tourism | tourism.js | stato | ⬜ |  |
| `tourismTerminate` | tourism | tourism.js | eseguita | ⬜ |  |
| `tutorialNext` | tutorial | tutorial.js | assente | ⬜ |  |
| `tutorialSkip` | tutorial | tutorial.js | assente | ⬜ |  |
| `_vanityColor` | vanity | vanity.js | ok | ⬜ |  |
| `_vanityEmblem` | vanity | vanity.js | ok | ⬜ |  |
| `_vanityTitle` | vanity | vanity.js | ok | ⬜ |  |
| `acceptVipEmiro` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `acceptVipErede` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `acceptVipGarante` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `acceptVipGolden` | vip-clients | vip-clients.js | — | ⬜ |  |
| `acceptVipGrigori` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `acceptVipOnorevole` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `acceptVipPlatinum` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `acceptVipStrata` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `acceptVipTechBro` | vip-clients | vip-clients.js | — | ⬜ |  |
| `acceptVipWedding` | vip-clients | vip-clients.js | — | ⬜ |  |
| `vipGaranteEventIntimidisci` | vip-clients | vip-clients.js | ok | ⬜ |  |
| `vipGaranteEventPaga` | vip-clients | vip-clients.js | ok | ⬜ |  |
| `vipGrigoriEventAccept` | vip-clients | vip-clients.js | ok | ⬜ |  |
| `vipGrigoriEventDecline` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `vipOnorevoleEventCopera` | vip-clients | vip-clients.js | ok | ⬜ |  |
| `vipOnorevoleEventResisti` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `vipPlatinumEventAllow` | vip-clients | vip-clients.js | stato | ⬜ |  |
| `vipPlatinumEventBlock` | vip-clients | vip-clients.js | ok | ⬜ |  |
| `vipWeddingEventGestisci` | vip-clients | vip-clients.js | ok | ⬜ |  |
| `vipWeddingEventIgnora` | vip-clients | vip-clients.js | eseguita | ⬜ |  |
| `vipWeddingPaymentCollect` | vip-clients | vip-clients.js | ok | ⬜ |  |
| `_closeVittorioModal` | vittorio | vittorio.js | — | ⬜ |  |
| `flipVittorio` | vittorio | vittorio.js | — | ⬜ |  |
| `repayVittorio` | vittorio | vittorio.js | ok | ⬜ |  |
| `openVTKModal` | vtk-market | vtk-market.js | stato | ⬜ |  |
| `vtkBuyShopItem` | vtk-market | vtk-market.js | ok | ⬜ |  |
| `vtkCancelOrder` | vtk-market | vtk-market.js | eseguita | ⬜ |  |
| `vtkFillOrder` | vtk-market | vtk-market.js | eseguita | ⬜ |  |
| `_wrAcquire` | war_room | war_room.js | assente | ⬜ |  |
| `_wrClose` | war_room | war_room.js | assente | ⬜ |  |
| `_ceCapitalismAck` | zero-to-hero | zero-to-hero.js | — | ⬜ |  |
| `executeManualDrive` | zero-to-hero | zero-to-hero.js | ok | ⬜ |  |
| `executeSleepInCar` | zero-to-hero | zero-to-hero.js | eseguita | ⬜ |  |
| `hireNeighborhoodKid` | zero-to-hero | zero-to-hero.js | — | ⬜ |  |

## Come si chiude una riga

1. Porta il gioco nello stato che l'azione richiede (usa `test-support/regista.js`).
2. Esegui l'azione **come la esegue il giocatore**: dal bottone, non dalla console.
3. Controlla i tre effetti: lo stato locale cambia, il denaro passa da `CE_money`,
   il server riceve la scrittura.
4. Scrivi il test che la difende e provalo al contrario (rompi il codice: deve diventare rosso).
5. `npm test` intero. Poi metti ✅ qui e fai un commit.

Se trovi un difetto e non lo correggi nella stessa sessione, metti 🐛 e scrivi nelle
note **cosa** hai visto — non «da controllare», ma il sintomo preciso.
