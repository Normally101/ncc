# Registro delle azioni e funzioni — Moduli di Interfaccia (`ui-*.js`)

> **Regola 4 del criterio uniforme.** Ogni azione del giocatore passa da `dispatch()` in `events.js`, che legge `data-ce-act` e chiama la corrispondente funzione globale su `window`.
> Questo registro censisce tutte le funzioni globali definite nei moduli di interfaccia (`ui-*.js`), mappando l'aggancio `data-ce-act`, le eventuali collisioni di nomi con altri file e le porte di transazione economica.

Origine: censimento dei 22 file `ui-*.js` del client web.

---

## Censimento funzioni per file

### `ui-career.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `_carIsUnlocked` | `ui-career.js:168` | nessuna | nessuno | no |
| `_carRewardLine` | `ui-career.js:172` | nessuna | nessuno | no |
| `_carGetData` | `ui-career.js:185` | nessuna | nessuno | no |
| `_buildCareerModal` | `ui-career.js:226` | nessuna | nessuno | no |
| `_dayCompleted` | `ui-career.js:351` | nessuna | nessuno | no |
| `_buildActiveStory` | `ui-career.js:365` | nessuna | nessuno | no |
| `_buildClaimStory` | `ui-career.js:428` | nessuna | nessuno | no |
| `_buildClaimMile` | `ui-career.js:453` | nessuna | nessuno | no |
| `_buildMileRow` | `ui-career.js:467` | nessuna | nessuno | no |
| `_buildRewardChips` | `ui-career.js:481` | nessuna | nessuno | no |
| `openCareerModal` | `ui-career.js:495` | nessuna (chiamata via switchTab/renderTabCareer) | nessuno | no |
| `closeCareerModal` | `ui-career.js:515` | `closeCareerModal` (`ui-career.js:321`) | nessuno | no |
| `renderTabCareer` | `ui-career.js:527` | nessuna (switchTab 'career') | nessuno | no |
| `startMissionRun` | `ui-career.js:534` | `startMissionRun` (`ui-career.js:385`) | nessuno | no |
| `_showBivioModal` | `ui-career.js:546` | nessuna (interna a startMissionRun) | nessuno | no |
| `_applyBivioChoice` | `ui-career.js:575` | `_applyBivioChoice` (`ui-career.js:549`) | nessuno | no |

### `ui-dispatch.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabCorse` | `ui-dispatch.js:4` | nessuna (switchTab 'corse') | nessuno | no |
| `_updateTrafficLabel` | `ui-dispatch.js:185` | nessuna | nessuno | no |
| `setupDragAndDrop` | `ui-dispatch.js:193` | nessuna (chiamata al bootstrap da `ui-realestate.js:179`) | nessuno | no |

### `ui-emails.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `setInboxTab` | `ui-emails.js:10` | `setInboxTab` (`ui-emails.js:54, 55, 56`) | nessuno | no |
| `resolveEmail` | `ui-emails.js:11` | `resolveEmail` (multiple righe template) | nessuno | no |
| `collectBrokerEmail` | `ui-emails.js:16` | `collectBrokerEmail` (`ui-emails.js:231`) | nessuno | no (solo particelle grafiche; accredito gestito in `engine-finance.js`) |
| `renderTabEmails` | `ui-emails.js:26` | nessuna (switchTab 'emails') | nessuno | no |

### `ui-finance.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `_flashTicker` | `ui-finance.js:4` | nessuna | nessuno | no |
| `renderTabFinance` | `ui-finance.js:12` | nessuna (switchTab 'finance') | nessuno | no |

### `ui-fleet.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabFleet` | `ui-fleet.js:4` | nessuna (switchTab 'fleet') | nessuno | no |
| `bulkRepairFleet` | `ui-fleet.js:408` | `bulkRepairFleet` (`ui-fleet.js:203`) | nessuno | CE_money (itera veicoli e chiama `payToRepairCar`) |

### `ui-help.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabHelp` | `ui-help.js:6` | nessuna (switchTab 'help') | nessuno | no |
| `renderCurrentTab` | `ui-help.js:79` | nessuna (chiamata da `lang.js:162`) | nessuno | no |

### `ui-home.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `_homeEsc` | `ui-home.js:4` | nessuna | nessuno | no |
| `_homeLevel` | `ui-home.js:6` | nessuna | nessuno | no |
| `_homeCashFmt` | `ui-home.js:22` | nessuna | nessuno | no |
| `_homeStreakCard` | `ui-home.js:29` | nessuna | nessuno | no |
| `_homeWeeklyBanner` | `ui-home.js:80` | nessuna | nessuno | no |
| `_homeContractCard` | `ui-home.js:110` | nessuna | nessuno | no |
| `renderTabHome` | `ui-home.js:134` | nessuna (switchTab 'home' e auto-refresh timer) | nessuno | no |

### `ui-hub.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `toggleHub` | `ui-hub.js:6` | `toggleHub` (`index.html`) | nessuno | no |
| `openHub` | `ui-hub.js:13` | `openHub` | nessuno | no |
| `closeHub` | `ui-hub.js:25` | `closeHub` (`index.html:355`) | nessuno | no |
| `hubNavigate` | `ui-hub.js:32` | `hubNavigate` (`ui-fleet.js:313`, `nemesis.js:207`) | nessuno | no |
| `_updateHubStats` | `ui-hub.js:37` | nessuna (chiamata da `updateUI` in `dispatcher.js`) | nessuno | no |

### `ui-investments.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabInvestments` | `ui-investments.js:5` | nessuna (switchTab 'investments') | nessuno | no |

### `ui-landing.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `_showAuthOverlay` | `ui-landing.js:11` | nessuna | nessuno | no |
| `openShowcase` | `ui-landing.js:380` | `openShowcase` (`ui-landing.js:213, 221, 231, 241`) | nessuno | no |
| `closeLbIfBackdrop` | `ui-landing.js:404` | `closeLbIfBackdrop` (`ui-landing.js:388`) | nessuno | no |
| `_animateLpCounters` | `ui-landing.js:412` | nessuna | nessuno | no |
| `_fetchLpRankings` | `ui-landing.js:431` | nessuna | nessuno | no |
| `_setAuthError` | `ui-landing.js:458` | nessuna | nessuno | no |
| `_setAuthLoading` | `ui-landing.js:463` | nessuna | nessuno | no |
| `_authLogin` | `ui-landing.js:470` | `_authLogin` (`ui-landing.js:82`) | nessuno | no |
| `_authSignup` | `ui-landing.js:491` | `_authSignup` (`ui-landing.js:84`) | nessuno | no |
| `_authForgotPassword` | `ui-landing.js:520` | chiamata da `ceForgotPassword` (`ce-actions.js:81`) | nessuno | no |
| `_translateAuthError` | `ui-landing.js:547` | nessuna | nessuno | no |

### `ui-legal.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabLegal` | `ui-legal.js:6` | nessuna (switchTab 'legal') | nessuno | no |

### `ui-lifestyle.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabLifestyle` | `ui-lifestyle.js:5` | nessuna (switchTab 'lifestyle') | nessuno | no |
| `decreesRefresh` | `ui-lifestyle.js:142` | nessuna | nessuno | no |
| `getDecreeEffects` | `ui-lifestyle.js:156` | nessuna | nessuno | no |
| `voteServerDecree` | `ui-lifestyle.js:170` | chiamata da `ceVoteDecree` (`ce-actions.js:34`) | nessuno | no (spende lobbying points via RPC) |

### `ui-map-utils.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `spawnMoneyParticles` | `ui-map-utils.js:8` | nessuna | nessuno | no |
| `_updateDayNight` | `ui-map-utils.js:27` | nessuna | nessuno | no |
| `_updateHQMarker` | `ui-map-utils.js:55` | nessuna | nessuno | no |
| `flyToHQ` | `ui-map-utils.js:75` | `flyToHQ` | nessuno | no |
| `_checkFoundingOverlay` | `ui-map-utils.js:83` | nessuna | nessuno | no |
| `_startFoundingMode` | `ui-map-utils.js:100` | `_startFoundingMode` | nessuno | no |
| `_cancelFoundingMode` | `ui-map-utils.js:123` | `_cancelFoundingMode` | nessuno | no |
| `_updateActiveRouteLinesColored` | `ui-map-utils.js:131` | nessuna | nessuno | no |
| `_updateActiveRouteLines` | `ui-map-utils.js:164` | nessuna | `map.js:343` | no |
| `openAcademyModal` | `ui-map-utils.js:167` | `openAcademyModal` (`ui-staff.js:246`, `ce-actions.js:46`) | nessuno | no |
| `_academySelectDriver` | `ui-map-utils.js:255` | `_academySelectDriver` (`ui-map-utils.js:189`) | nessuno | no |
| `_traitBadgeHTML` | `ui-map-utils.js:262` | nessuna | nessuno | no |

### `ui-market.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabMarket` | `ui-market.js:5` | nessuna (switchTab 'market') | nessuno | no |

### `ui-marketing.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabMarketing` | `ui-marketing.js:8` | nessuna (switchTab 'marketing') | nessuno | no |

### `ui-ops.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabRegions` | `ui-ops.js:4` | nessuna (switchTab 'regions') | nessuno | no |
| `renderTabProvinces` | `ui-ops.js:88` | nessuna (switchTab 'provinces') | `war_room.js:495` | no |
| `buyHRAutomation` | `ui-ops.js:218` | `buyHRAutomation` (`ui-staff.js:77`) | nessuno | CE_money (`CE_money.spendDC(5)`) |
| `doAcquireProvince` | `ui-ops.js:249` | `doAcquireProvince` (`ui-ops.js:199`) | nessuno | RPC (`ServerState.acquireProvince`) |

### `ui-politics.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabPolitics` | `ui-politics.js:5` | nessuna (switchTab 'politics') | nessuno | no |
| `_renderDecreesSection` | `ui-politics.js:110` | nessuna | nessuno | no |

### `ui-ranking.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabRanking` | `ui-ranking.js:4` | nessuna (switchTab 'ranking') | nessuno | no |

### `ui-realestate.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `_appendNewsTicker` | `ui-realestate.js:6` | nessuna | nessuno | no |
| `_initGlobalNewsFeed` | `ui-realestate.js:16` | nessuna | nessuno | no |
| `renderTabRealEstate` | `ui-realestate.js:29` | nessuna (switchTab 'realestate') | nessuno | no |
| `doBuyRealEstate` | `ui-realestate.js:170` | `doBuyRealEstate` (`ui-realestate.js:161`) | nessuno | RPC (`ServerState.buyRealEstate`) |

### `ui-sidebar.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `_sidebarToggle` | `ui-sidebar.js:21` | `_sidebarToggle` | nessuno | no |
| `_sidebarActivateTab` | `ui-sidebar.js:45` | nessuna | nessuno | no |
| `switchTab` | `ui-sidebar.js:64` | `switchTab` | `dispatcher.js:203` (decoratore intenzionale) | no |
| `updateSidebarStats` | `ui-sidebar.js:71` | nessuna | nessuno | no |
| `updateUI` | `ui-sidebar.js:85` | nessuna | `dispatcher.js:332` (decoratore intenzionale) | no |
| `toggleSidebar` | `ui-sidebar.js:92` | `toggleSidebar` | nessuno | no |

### `ui-staff.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `renderTabStaff` | `ui-staff.js:13` | nessuna (switchTab 'staff') | nessuno | no |
| `openCarModal` | `ui-staff.js:275` | `openCarModal` (`ui-fleet.js:269`) | nessuno | no |
| `closeModals` | `ui-staff.js:365` | `closeModals` (anche da `ceListCar`) | nessuno | no |
| `fireStaff` | `ui-staff.js:371` | `fireStaff` (`ui-staff.js:48`) | nessuno | no |
| `hireOfficeStaff` | `ui-staff.js:381` | `hireOfficeStaff` (`ui-staff.js:49`) | nessuno | RPC (`ServerState.hireDriver`) |
| `openCarConfigurator` | `ui-staff.js:400` | nessuna (chiamato da `buyCar` in `ui-staff.js:583`) | nessuno | RPC / CE_money (codice orfano) |
| `__cfgToggle` | `ui-staff.js:516` | `__cfgToggle` (`ui-staff.js:464`) | nessuno | no |
| `__cfgConfirm` | `ui-staff.js:537` | `__cfgConfirm` (`ui-staff.js:501`) | nessuno | RPC (`ServerState.buyVehicle`, `ServerState.buyVehicleUpgrade`) / fallback `CE_money.spend` |
| `buyCar` | `ui-staff.js:583` | nessuna | nessuno | inoltra a `openCarConfigurator` (codice orfano) |
| `leaseCar` | `ui-staff.js:585` | nessuna | nessuno | RPC (`ServerState.buyVehicle`) / fallback `CE_money.spend` (codice orfano) |

### `ui-store.js`
| Nome | File:Riga | Azione `data-ce-act` | Doppione in altro file | Movimento denaro |
|---|---|---|---|---|
| `_ecSwitchTab` | `ui-store.js:7` | `_ecSwitchTab` (`ui-store.js:35, 36, 37, 38`) | nessuno | no |
| `renderTabPremiumStore` | `ui-store.js:10` | nessuna (switchTab 'store') | nessuno | no |
| `_dcSimPurchase` | `ui-store.js:261` | `_dcSimPurchase` (`ui-store.js:189`) | nessuno | CE_money (`CE_money.addDC`) |
| `_dcSpend` | `ui-store.js:269` | `_dcSpend` (`ui-store.js:126, 137, 147, 157, 167`) | nessuno | CE_money (`CE_money.spendDC`) |
| `_ecCaffeSospeso` | `ui-store.js:318` | `_ecCaffeSospeso` (`ui-store.js:63`) | nessuno | CE_money (`_dcSpend`) |
| `_ecManutenzioneExpress` | `ui-store.js:331` | `_ecManutenzioneExpress` (`ui-store.js:74`) | nessuno | CE_money (`_dcSpend`) |
| `_ecTangenteSindacato` | `ui-store.js:344` | `_ecTangenteSindacato` (`ui-store.js:84`) | nessuno | CE_money (`_dcSpend`) |
| `_ecPolizzaKasko` | `ui-store.js:354` | `_ecPolizzaKasko` (`ui-store.js:94`) | nessuno | CE_money (`_dcSpend`) |
| `_ecRadarVip` | `ui-store.js:371` | `_ecRadarVip` (`ui-store.js:104`) | nessuno | CE_money (`_dcSpend`) |
| `_ecTargaPresidenziale` | `ui-store.js:382` | chiamata da `ceTargaPresidenziale` (`ce-actions.js:87`) | nessuno | CE_money (`_dcSpend`) |

---

## Approfondimento: Configuratore Auto in `ui-staff.js` (Codice Morto)

Nel file `ui-staff.js` (righe 400-588, ~188 righe) persistono le funzioni:
- `openCarConfigurator(carId, type)` (riga 400)
- `__cfgToggle(uid)` (riga 516)
- `__cfgConfirm(cId, cType)` (riga 537)
- `buyCar(carId, type)` (riga 583)
- `leaseCar(carId)` (riga 585)

**Perché sono morte:**
L'acquisto e configurazione dei veicoli è stato integralmente migrato in `showroom.js` con la propria UI modale e l'azione `_srmPurchase` (`showroom.js:564`), mentre il banner di navigazione della tab Flotta punta a `hubNavigate('showroom')`. Le funzioni in `ui-staff.js` non sono richiamate da alcun elemento DOM o handler di produzione (persistono solo invocazioni isolate nei test legacy `test/economy/staff-sync.test.js`).

---

## Nomi definiti due volte (Collisioni Globali)

| Nome Funzione | Prima Definizione | Seconda Definizione | Tipologia / Impatto |
|---|---|---|---|
| `renderTabProvinces` | `ui-ops.js:88` | `war_room.js:495` | **Collisione reale**: due schermate diverse per la stessa tab. L'ordine di caricamento decide quale render vince. |
| `_updateActiveRouteLines` | `map.js:343` | `ui-map-utils.js:164` | **Sovrascrittura**: `ui-map-utils.js` sostituisce l'aggiornamento linee con la variante colorata. |
| `switchTab` | `dispatcher.js:203` | `ui-sidebar.js:64` | **Decoratore intenzionale**: `ui-sidebar.js` avvolge `switchTab` per sincronizzare la sidebar. |
| `updateUI` | `dispatcher.js:332` | `ui-sidebar.js:85` | **Decoratore intenzionale**: `ui-sidebar.js` avvolge `updateUI` per sincronizzare le statistiche sidebar. |

---

## Funzioni non chiamate (Orfane o senza chiamante `data-ce-act`)

### 1. Funzioni helper / logiche interne mai referenziate
- `_updateTrafficLabel` (`ui-dispatch.js:185`) — non invocata da alcuna routine di aggiornamento traffico o mappa.
- `_translateAuthError` (`ui-landing.js:547`) — mai richiamata nei catch del form di login/signup.

### 2. Funzioni di configurazione veicoli legacy (sostituite da Showroom)
- `openCarConfigurator` (`ui-staff.js:400`)
- `buyCar` (`ui-staff.js:583`)
- `leaseCar` (`ui-staff.js:585`)

### 3. Funzioni di rendering tab (invocate programmaticamente dal router `switchTab`)
Queste funzioni non sono agganciate a `data-ce-act` perché attivate dal dispatcher in base alla tab corrente:
- `renderTabCareer` (`ui-career.js:527`)
- `renderTabCorse` (`ui-dispatch.js:4`)
- `renderTabEmails` (`ui-emails.js:26`)
- `renderTabFinance` (`ui-finance.js:12`)
- `renderTabFleet` (`ui-fleet.js:4`)
- `renderTabHelp` (`ui-help.js:6`)
- `renderTabHome` (`ui-home.js:134`)
- `renderTabInvestments` (`ui-investments.js:5`)
- `renderTabLegal` (`ui-legal.js:6`)
- `renderTabLifestyle` (`ui-lifestyle.js:5`)
- `renderTabMarket` (`ui-market.js:5`)
- `renderTabMarketing` (`ui-marketing.js:8`)
- `renderTabRegions` (`ui-ops.js:4`)
- `renderTabProvinces` (`ui-ops.js:88`)
- `renderTabPolitics` (`ui-politics.js:5`)
- `renderTabRanking` (`ui-ranking.js:4`)
- `renderTabRealEstate` (`ui-realestate.js:29`)
- `renderTabStaff` (`ui-staff.js:13`)
- `renderTabPremiumStore` (`ui-store.js:10`)
