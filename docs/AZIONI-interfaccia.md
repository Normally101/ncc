# Registro delle azioni — Interfaccia (file `ui-*.js`)

> Mappatura delle funzioni globali per i 22 file di interfaccia (`ui-*.js`).
> Per ogni funzione sono indicati: nome, file e riga di definizione, le azioni `data-ce-act` che la invocano (o "nessuna"),
> se esistono altre definizioni con lo stesso nome in altri file del repository, e la porta usata per il movimento di denaro (`CE_money` / `RPC` / `diretto` / "no").

## `ui-career.js`

- `_carIsUnlocked` · `ui-career.js:168` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_carRewardLine` · `ui-career.js:172` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_carGetData` · `ui-career.js:185` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_buildCareerModal` · `ui-career.js:226` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_dayCompleted` · `ui-career.js:351` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_buildActiveStory` · `ui-career.js:365` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_buildClaimStory` · `ui-career.js:428` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_buildClaimMile` · `ui-career.js:453` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_buildMileRow` · `ui-career.js:467` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_buildRewardChips` · `ui-career.js:481` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `openCareerModal` · `ui-career.js:495` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `closeCareerModal` · `ui-career.js:515` · data-ce-act: `closeCareerModal` (`ui-career.js`) · doppioni: nessuno · denaro: no
- `renderTabCareer` · `ui-career.js:527` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `startMissionRun` · `ui-career.js:534` · data-ce-act: `startMissionRun` (`ui-career.js`) · doppioni: nessuno · denaro: no
- `_showBivioModal` · `ui-career.js:546` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_bivioQuestRef` · `ui-career.js:572` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_applyBivioChoice` · `ui-career.js:575` · data-ce-act: `_applyBivioChoice` (`ui-career.js`) · doppioni: nessuno · denaro: no

## `ui-dispatch.js`

- `renderTabCorse` · `ui-dispatch.js:4` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `setupDragAndDrop` · `ui-dispatch.js:229` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabCorse` · `ui-dispatch.js:302` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `setupDragAndDrop` · `ui-dispatch.js:303` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-emails.js`

- `setInboxTab` · `ui-emails.js:10` · data-ce-act: `setInboxTab` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `resolveEmail` · `ui-emails.js:11` · data-ce-act: `resolveEmail` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `collectBrokerEmail` · `ui-emails.js:16` · data-ce-act: `collectBrokerEmail` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `renderTabEmails` · `ui-emails.js:26` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_emailCardClass` · `ui-emails.js:107` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_emailBadgeClass` · `ui-emails.js:117` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_emailBadgeLabel` · `ui-emails.js:127` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_emailSenderIcon` · `ui-emails.js:142` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-finance.js`

- `_flashTicker` · `ui-finance.js:4` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabFinance` · `ui-finance.js:12` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_kpi` · `ui-finance.js:87` · data-ce-act: nessuna · doppioni: `ui-ranking.js:105` · denaro: no
- `_sec` · `ui-finance.js:95` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_buildSparkline` · `ui-finance.js:126` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_sparkCemp` · `ui-finance.js:294` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabFinance` · `ui-finance.js:447` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-fleet.js`

- `renderTabFleet` · `ui-fleet.js:4` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `bulkRepairFleet` · `ui-fleet.js:416` · data-ce-act: `bulkRepairFleet` (`ui-fleet.js`) · doppioni: nessuno · denaro: no
- `renderTabFleet` · `ui-fleet.js:432` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-help.js`

- `renderTabHelp` · `ui-help.js:6` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabHelp` · `ui-help.js:77` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderCurrentTab` · `ui-help.js:79` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-home.js`

- `_homeEsc` · `ui-home.js:4` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_homeLevel` · `ui-home.js:6` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_homeCashFmt` · `ui-home.js:22` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_homeStreakCard` · `ui-home.js:29` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_homeWeeklyBanner` · `ui-home.js:80` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_homeContractCard` · `ui-home.js:110` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabHome` · `ui-home.js:134` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-hub.js`

- `toggleHub` · `ui-hub.js:6` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `openHub` · `ui-hub.js:13` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `closeHub` · `ui-hub.js:25` · data-ce-act: `closeHub` (`index.html`) · doppioni: nessuno · denaro: no
- `hubNavigate` · `ui-hub.js:32` · data-ce-act: `hubNavigate` (`index.html`, `nemesis.js`, `ui-fleet.js`) · doppioni: nessuno · denaro: no
- `_updateHubStats` · `ui-hub.js:37` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_updateHubStats` · `ui-hub.js:98` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-investments.js`

- `renderTabInvestments` · `ui-investments.js:5` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabInvestments` · `ui-investments.js:257` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-landing.js`

- `_showAuthOverlay` · `ui-landing.js:11` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `openShowcase` · `ui-landing.js:380` · data-ce-act: `openShowcase` (`ui-landing.js`) · doppioni: nessuno · denaro: no
- `closeLbIfBackdrop` · `ui-landing.js:404` · data-ce-act: `closeLbIfBackdrop` (`ui-landing.js`) · doppioni: nessuno · denaro: no
- `_animateLpCounters` · `ui-landing.js:412` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_fetchLpRankings` · `ui-landing.js:431` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_setAuthError` · `ui-landing.js:458` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_setAuthLoading` · `ui-landing.js:463` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_authLogin` · `ui-landing.js:470` · data-ce-act: `_authLogin` (`ui-landing.js`) · doppioni: nessuno · denaro: no
- `_authSignup` · `ui-landing.js:491` · data-ce-act: `_authSignup` (`ui-landing.js`) · doppioni: nessuno · denaro: no
- `_authForgotPassword` · `ui-landing.js:520` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_translateAuthError` · `ui-landing.js:547` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-legal.js`

- `renderTabLegal` · `ui-legal.js:6` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabLegal` · `ui-legal.js:103` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-lifestyle.js`

- `renderTabLifestyle` · `ui-lifestyle.js:5` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabLifestyle` · `ui-lifestyle.js:137` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `decreesRefresh` · `ui-lifestyle.js:142` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_server_decrees, rpc_get_active_decrees`)
- `getDecreeEffects` · `ui-lifestyle.js:156` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `voteServerDecree` · `ui-lifestyle.js:170` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_vote_server_decree`)

## `ui-map-utils.js`

- `spawnMoneyParticles` · `ui-map-utils.js:8` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_mapPronta` · `ui-map-utils.js:30` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_updateDayNight` · `ui-map-utils.js:37` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_updateDayNight` · `ui-map-utils.js:50` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_updateHQMarker` · `ui-map-utils.js:65` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `flyToHQ` · `ui-map-utils.js:85` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_checkFoundingOverlay` · `ui-map-utils.js:93` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_foundingRegions` · `ui-map-utils.js:124` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_startFoundingList` · `ui-map-utils.js:149` · data-ce-act: `_startFoundingList` (`ui-map-utils.js`) · doppioni: nessuno · denaro: no
- `_foundFromRegion` · `ui-map-utils.js:166` · data-ce-act: `_foundFromRegion` (`ui-map-utils.js`) · doppioni: nessuno · denaro: no
- `_agganciaAllaTerraferma` · `ui-map-utils.js:189` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_startFoundingMode` · `ui-map-utils.js:199` · data-ce-act: `_startFoundingMode` (`ui-map-utils.js`) · doppioni: nessuno · denaro: no
- `_cancelFoundingMode` · `ui-map-utils.js:229` · data-ce-act: `_cancelFoundingMode` (`ui-map-utils.js`) · doppioni: nessuno · denaro: no
- `openAcademyModal` · `ui-map-utils.js:240` · data-ce-act: `openAcademyModal` (`ui-staff.js`) · doppioni: nessuno · denaro: no
- `_academySelectDriver` · `ui-map-utils.js:328` · data-ce-act: `_academySelectDriver` (`ui-map-utils.js`) · doppioni: nessuno · denaro: no
- `_traitBadgeHTML` · `ui-map-utils.js:335` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-market.js`

- `renderTabMarket` · `ui-market.js:5` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabMarket` · `ui-market.js:167` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-marketing.js`

- `renderTabMarketing` · `ui-marketing.js:8` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabMarketing` · `ui-marketing.js:333` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-ops.js`

- `renderTabRegions` · `ui-ops.js:4` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabProvinces` · `ui-ops.js:88` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `buyHRAutomation` · `ui-ops.js:218` · data-ce-act: `buyHRAutomation` (`ui-staff.js`) · doppioni: `serverState.js:534` · denaro: CE_money (`spendDC`)
- `doAcquireProvince` · `ui-ops.js:249` · data-ce-act: `doAcquireProvince` (`ui-ops.js`) · doppioni: nessuno · denaro: no
- `renderTabRegions` · `ui-ops.js:263` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabProvinces` · `ui-ops.js:264` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-politics.js`

- `renderTabPolitics` · `ui-politics.js:5` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabPolitics` · `ui-politics.js:108` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderDecreesSection` · `ui-politics.js:110` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-ranking.js`

- `renderTabRanking` · `ui-ranking.js:4` · data-ce-act: `renderTabRanking` (`ui-ranking.js`) · doppioni: nessuno · denaro: no
- `_kpi` · `ui-ranking.js:105` · data-ce-act: nessuna · doppioni: `ui-finance.js:87` · denaro: no
- `renderTabRanking` · `ui-ranking.js:272` · data-ce-act: `renderTabRanking` (`ui-ranking.js`) · doppioni: nessuno · denaro: no

## `ui-realestate.js`

- `_appendNewsTicker` · `ui-realestate.js:6` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_initGlobalNewsFeed` · `ui-realestate.js:16` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabRealEstate` · `ui-realestate.js:29` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabRealEstate` · `ui-realestate.js:168` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `doBuyRealEstate` · `ui-realestate.js:170` · data-ce-act: `doBuyRealEstate` (`ui-realestate.js`) · doppioni: nessuno · denaro: no

## `ui-sidebar.js`

- `_sidebarToggle` · `ui-sidebar.js:21` · data-ce-act: `_sidebarToggle` (`index.html`) · doppioni: nessuno · denaro: no
- `_sidebarActivateTab` · `ui-sidebar.js:45` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `switchTab` · `ui-sidebar.js:64` · data-ce-act: `switchTab` (`index.html`, `onboarding.js`, `ui-finance.js`, `ui-home.js`, `vanity.js`, `world-feed.js`) · doppioni: `dispatcher.js:150`, `em-chrome.js:32`, `motion.js:164`, `premium-ui.js:12`, `zero-to-hero.js:182` · denaro: no
- `updateSidebarStats` · `ui-sidebar.js:71` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `updateUI` · `ui-sidebar.js:85` · data-ce-act: nessuna · doppioni: `engine.js:1986`, `objective-tracker.js:147` · denaro: no
- `toggleSidebar` · `ui-sidebar.js:92` · data-ce-act: `toggleSidebar` (`index.html`) · doppioni: nessuno · denaro: no

## `ui-staff.js`

- `renderTabStaff` · `ui-staff.js:12` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `openCarModal` · `ui-staff.js:275` · data-ce-act: `openCarModal` (`ui-fleet.js`) · doppioni: nessuno · denaro: no
- `closeModals` · `ui-staff.js:365` · data-ce-act: `closeModals` (`index.html`) · doppioni: nessuno · denaro: no
- `fireStaff` · `ui-staff.js:371` · data-ce-act: `fireStaff` (`ui-staff.js`) · doppioni: nessuno · denaro: no
- `hireOfficeStaff` · `ui-staff.js:381` · data-ce-act: `hireOfficeStaff` (`ui-staff.js`) · doppioni: nessuno · denaro: no
- `renderTabStaff` · `ui-staff.js:404` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `ui-store.js`

- `_ecSwitchTab` · `ui-store.js:7` · data-ce-act: `_ecSwitchTab` (`ui-store.js`) · doppioni: nessuno · denaro: no
- `renderTabPremiumStore` · `ui-store.js:10` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabPremiumStore` · `ui-store.js:259` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`earnDC`)
- `_dcSimPurchase` · `ui-store.js:261` · data-ce-act: `_dcSimPurchase` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`earnDC`)
- `_dcSpend` · `ui-store.js:269` · data-ce-act: `_dcSpend` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_ecCaffeSospeso` · `ui-store.js:318` · data-ce-act: `_ecCaffeSospeso` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_ecManutenzioneExpress` · `ui-store.js:331` · data-ce-act: `_ecManutenzioneExpress` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_ecTangenteSindacato` · `ui-store.js:344` · data-ce-act: `_ecTangenteSindacato` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_ecPolizzaKasko` · `ui-store.js:354` · data-ce-act: `_ecPolizzaKasko` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_ecRadarVip` · `ui-store.js:371` · data-ce-act: `_ecRadarVip` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_ecTargaPresidenziale` · `ui-store.js:382` · data-ce-act: `_ecTargaPresidenziale` (`ui-store.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)

---

## Note speciali

### Configuratore auto in `ui-staff.js`
Il vecchio configuratore auto (circa 185 righe con `openCarConfigurator`, `__cfgSel`, `__cfgToggle`, `__cfgConfirm`, `buyCar`, `leaseCar`) è stato completamente rimosso dal codebase ed è sostituito dal modulo `showroom.js`. Il guardrail `test/guardrail/ui-staff-configuratore-rimosso.test.js` ne certifica l'assenza.

---

## Nomi definiti due volte (collisioni / doppioni)

| Nome | Definizione 1 | Definizione 2 / altre | Note |
|---|---|---|---|
| `_kpi` | `ui-finance.js:87` | `ui-ranking.js:105` |  |
| `buyHRAutomation` | `ui-ops.js:218` | `serverState.js:534` |  |
| `_kpi` | `ui-ranking.js:105` | `ui-finance.js:87` |  |
| `switchTab` | `ui-sidebar.js:64` | `dispatcher.js:150, em-chrome.js:32, motion.js:164, premium-ui.js:12, zero-to-hero.js:182` | Decoratore / catena di rendering UI deliberata |
| `updateUI` | `ui-sidebar.js:85` | `engine.js:1986, objective-tracker.js:147` | Decoratore / catena di rendering UI deliberata |

---

## Funzioni che nessuno chiama (codice morto)

| Funzione | Definizione | Note |
|---|---|---|
| `_carRewardLine` | `ui-career.js:172` | Nessuna invocazione trovata nel codebase (JS/HTML/data-ce-act) |

