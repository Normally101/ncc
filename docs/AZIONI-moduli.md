# Registro delle azioni — Moduli di gioco

> Mappatura delle funzioni globali per i 24 moduli di gioco.
> Per ogni funzione sono indicati: nome, file e riga di definizione, le azioni `data-ce-act` che la invocano (o "nessuna"),
> se esistono altre definizioni con lo stesso nome in altri file del repository, e la porta usata per il movimento di denaro (`CE_money` / `RPC` / `diretto` / "no").

## `p2p-market.js`

- `_p2pErrMsg` · `p2p-market.js:13` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_sb` · `p2p-market.js:49` · data-ce-act: nessuna · doppioni: `b2b.js:34` · denaro: no
- `_uid` · `p2p-market.js:50` · data-ce-act: nessuna · doppioni: `b2b.js:35` · denaro: no
- `listCarForSale` · `p2p-market.js:60` · data-ce-act: `listCarForSale` (`ui-market.js`) · doppioni: `engine-fleet.js:414` · denaro: RPC (`rpc_list_car_for_sale`)
- `cancelP2PListing` · `p2p-market.js:103` · data-ce-act: `cancelP2PListing` (`p2p-render.js`) · doppioni: nessuno · denaro: RPC (`rpc_cancel_listing`)
- `buyP2PCar` · `p2p-market.js:128` · data-ce-act: `buyP2PCar` (`p2p-render.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_market_car`)
- `createHolding` · `p2p-market.js:161` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_create_holding`)
- `joinHolding` · `p2p-market.js:172` · data-ce-act: `joinHolding` (`p2p-render.js`) · doppioni: nessuno · denaro: RPC (`rpc_join_holding`)
- `leaveHolding` · `p2p-market.js:181` · data-ce-act: `leaveHolding` (`p2p-render.js`) · doppioni: nessuno · denaro: RPC (`rpc_leave_holding`)
- `contributeHoldingTreasury` · `p2p-market.js:190` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_contribute_holding_treasury`)
- `listCompanyIPO` · `p2p-market.js:231` · data-ce-act: `listCompanyIPO` (`ui-finance.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_list_company_ipo`)
- `buyCompanyShares` · `p2p-market.js:269` · data-ce-act: `buyCompanyShares` (`p2p-render.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_company_shares`)
- `sellCompanyShares` · `p2p-market.js:291` · data-ce-act: `sellCompanyShares` (`p2p-render.js`) · doppioni: nessuno · denaro: CE_money (`accreditatoDalServer`) / RPC (`rpc_sell_company_shares`)
- `p2pFetchMarket` · `p2p-market.js:310` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `p2pFetchShares` · `p2p-market.js:325` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `p2pFetchHoldings` · `p2p-market.js:345` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `p2pFetchConsorzi` · `p2p-market.js:369` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `p2pFetchTension` · `p2p-market.js:400` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_tick_tension`)
- `p2pFetchGdfRisk` · `p2p-market.js:415` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_gdf_risk`)
- `_sindacatoGdfDailyCheck` · `p2p-market.js:425` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_gdf_inspection_check`)
- `p2pRefreshAll` · `p2p-market.js:445` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `p2pStartRealtime` · `p2p-market.js:464` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `p2p-render.js`

- `renderP2PMarketSection` · `p2p-render.js:13` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderP2PSharesSection` · `p2p-render.js:74` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderP2PHoldingsSection` · `p2p-render.js:128` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderBarometroWidget` · `p2p-render.js:195` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderP2PConsorziSection` · `p2p-render.js:229` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderIspettoratoSection` · `p2p-render.js:313` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `createConsorzio` · `p2p-render.js:387` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_create_consorzio`)
- `joinConsorzio` · `p2p-render.js:396` · data-ce-act: `joinConsorzio` (`p2p-render.js`) · doppioni: nessuno · denaro: RPC (`rpc_join_consorzio`)
- `leaveConsorzio` · `p2p-render.js:405` · data-ce-act: `leaveConsorzio` (`p2p-render.js`) · doppioni: nessuno · denaro: RPC (`rpc_leave_consorzio`)
- `contributeConsorzio` · `p2p-render.js:414` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_contribute_consorzio`)
- `hireCrumiri` · `p2p-render.js:439` · data-ce-act: `hireCrumiri` (`p2p-render.js`) · doppioni: nessuno · denaro: RPC (`rpc_hire_crumiri`)
- `payDonCarmine` · `p2p-render.js:451` · data-ce-act: `payDonCarmine` (`p2p-render.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_pay_don_carmine`)
- `p2pInit` · `p2p-render.js:478` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `vtk-market.js`

- `vtkRefreshOrders` · `vtk-market.js:86` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_vtk_market_orders`)
- `vtkPlaceSellOrder` · `vtk-market.js:98` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_place_vtk_sell_order`)
- `vtkFillOrder` · `vtk-market.js:126` · data-ce-act: `vtkFillOrder` (`vtk-market.js`) · doppioni: nessuno · denaro: RPC (`rpc_fill_vtk_order`)
- `vtkCancelOrder` · `vtk-market.js:148` · data-ce-act: `vtkCancelOrder` (`vtk-market.js`) · doppioni: nessuno · denaro: RPC (`rpc_cancel_vtk_order`)
- `vtkBuyShopItem` · `vtk-market.js:179` · data-ce-act: `vtkBuyShopItem` (`vtk-market.js`) · doppioni: nessuno · denaro: RPC (`rpc_spend_vtk_shop_item`)
- `openVTKModal` · `vtk-market.js:238` · data-ce-act: `openVTKModal` (`index.html`) · doppioni: nessuno · denaro: no
- `renderVTKModal` · `vtk-market.js:253` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vtkRenderMarket` · `vtk-market.js:314` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vtkRenderShop` · `vtk-market.js:387` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `crypto.js`

- `_cErr` · `crypto.js:16` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_fmt` · `crypto.js:24` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_fmtCoin` · `crypto.js:29` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_priceImpact` · `crypto.js:35` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `cryptoRefresh` · `crypto.js:45` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_crypto_portfolio`)
- `cryptoBuy` · `crypto.js:65` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_crypto`)
- `cryptoSell` · `crypto.js:82` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`accreditatoDalServer`) / RPC (`rpc_sell_crypto`)
- `cryptoDepositOffshore` · `crypto.js:99` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_deposit_offshore`)
- `cryptoWithdrawOffshore` · `crypto.js:118` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`accreditatoDalServer`) / RPC (`rpc_withdraw_offshore`)
- `cryptoOpenTradeModal` · `crypto.js:144` · data-ce-act: `cryptoOpenTradeModal` (`crypto.js`) · doppioni: nessuno · denaro: no
- `_cryptoUpdatePreview` · `crypto.js:192` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabCrypto` · `crypto.js:210` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_cryptoSubscribeRealtime` · `crypto.js:312` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `cryptoInit` · `crypto.js:327` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `auctions.js`

- `_aErr` · `auctions.js:15` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_fmtCurrency` · `auctions.js:20` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_countdown` · `auctions.js:25` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tierBadge` · `auctions.js:39` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `auctionsRefresh` · `auctions.js:57` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_judicial_auctions, rpc_get_won_auctions, rpc_get_my_bids`)
- `auctionsPlaceBid` · `auctions.js:76` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_place_auction_bid`)
- `auctionsOpenBidModal` · `auctions.js:91` · data-ce-act: `auctionsOpenBidModal` (`auctions.js`) · doppioni: nessuno · denaro: no
- `auctionsConfirmBid` · `auctions.js:142` · data-ce-act: `auctionsConfirmBid` (`auctions.js`) · doppioni: nessuno · denaro: no
- `_autoDalLotto` · `auctions.js:178` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `auctionsClaim` · `auctions.js:221` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`accreditatoDalServer`) / RPC (`rpc_claim_auction`)
- `auctionsRevealWon` · `auctions.js:254` · data-ce-act: `auctionsRevealWon` (`auctions.js`) · doppioni: nessuno · denaro: no
- `renderTabAuctions` · `auctions.js:313` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_auctionsSubscribeRealtime` · `auctions.js:437` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `auctionsInit` · `auctions.js:454` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `alliances.js`

- `_allyPerkMult` · `alliances.js:29` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_allyRefreshPerk` · `alliances.js:38` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_allyActivePerk` · `alliances.js:44` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabConsorzi` · `alliances.js:57` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderMember` · `alliances.js:85` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderBrowse` · `alliances.js:213` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_unsubscribeChat` · `alliances.js:260` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_subscribeChat` · `alliances.js:265` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_rpc` · `alliances.js:286` · data-ce-act: nessuna · doppioni: `serverState.js:370` · denaro: no
- `_alCreate` · `alliances.js:292` · data-ce-act: `_alCreate` (`alliances.js`) · doppioni: nessuno · denaro: CE_money (`spend, earn`)
- `_alJoin` · `alliances.js:315` · data-ce-act: `_alJoin` (`alliances.js`) · doppioni: nessuno · denaro: no
- `_alLeave` · `alliances.js:323` · data-ce-act: `_alLeave` (`alliances.js`) · doppioni: nessuno · denaro: no
- `_alDisband` · `alliances.js:334` · data-ce-act: `_alDisband` (`alliances.js`) · doppioni: nessuno · denaro: no
- `_alDonate` · `alliances.js:345` · data-ce-act: `_alDonate` (`alliances.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`)
- `_alChat` · `alliances.js:362` · data-ce-act: `_alChat` (`alliances.js`) · doppioni: nessuno · denaro: no
- `_alKick` · `alliances.js:371` · data-ce-act: `_alKick` (`alliances.js`) · doppioni: nessuno · denaro: no
- `_alSetRole` · `alliances.js:377` · data-ce-act: `_alSetRole` (`alliances.js`) · doppioni: nessuno · denaro: no
- `_alPerk` · `alliances.js:383` · data-ce-act: `_alPerk` (`alliances.js`) · doppioni: nessuno · denaro: no

## `hostile_takeover.js`

- `renderTabOPA` · `hostile_takeover.js:6` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_loadOPAList` · `hostile_takeover.js:36` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_hostile_takeovers`)
- `_renderOPACard` · `hostile_takeover.js:66` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_opaRequestBuyback` · `hostile_takeover.js:126` · data-ce-act: `_opaRequestBuyback` (`hostile_takeover.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_opa_buyback`)

## `infrastructure.js`

- `renderTabInfrastructure` · `infrastructure.js:14` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_fuel_depots`)
- `_renderInfraContent` · `infrastructure.js:41` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderMyDepotCard` · `infrastructure.js:88` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderAvailableCard` · `infrastructure.js:113` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderOccupiedCard` · `infrastructure.js:130` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderRivalCard` · `infrastructure.js:150` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_infraBuyDepot` · `infrastructure.js:164` · data-ce-act: `_infraBuyDepot` (`infrastructure.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_buy_fuel_depot`)
- `_infraSetMarkup` · `infrastructure.js:192` · data-ce-act: `_infraSetMarkup` (`infrastructure.js`) · doppioni: nessuno · denaro: RPC (`rpc_set_fuel_markup`)

## `tourism.js`

- `_tSb` · `tourism.js:22` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tUid` · `tourism.js:23` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tQualifyingCount` · `tourism.js:25` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tPlayerScore` · `tourism.js:32` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tMeetsReqs` · `tourism.js:47` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tCountdown` · `tourism.js:59` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tTierBadge` · `tourism.js:70` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tBarColor` · `tourism.js:78` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `tourismRefresh` · `tourism.js:84` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_tourism_tenders`)
- `tourismSubmitBid` · `tourism.js:99` · data-ce-act: `tourismSubmitBid` (`tourism.js`) · doppioni: nessuno · denaro: RPC (`rpc_submit_tourism_bid`)
- `tourismCancelBid` · `tourism.js:120` · data-ce-act: `tourismCancelBid` (`tourism.js`) · doppioni: nessuno · denaro: RPC (`rpc_cancel_tourism_bid`)
- `tourismTerminate` · `tourism.js:129` · data-ce-act: `tourismTerminate` (`tourism.js`) · doppioni: nessuno · denaro: CE_money (`addReputation`) / RPC (`rpc_terminate_tourism_contract`)
- `_tourismDailyTick` · `tourism.js:152` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`accreditatoDalServer`) / RPC (`rpc_tourism_daily_tick`)
- `_tUpdateScorePreview` · `tourism.js:179` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tSetPledge` · `tourism.js:203` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabTourism` · `tourism.js:210` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tRenderOpenBids` · `tourism.js:287` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tRenderOpenCard` · `tourism.js:317` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tRenderLockedCard` · `tourism.js:401` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tRenderCooldownCard` · `tourism.js:419` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tRenderMyContracts` · `tourism.js:438` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `tourismInit` · `tourism.js:495` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `b2b.js`

- `_b2bCarRank` · `b2b.js:24` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_b2bReqRank` · `b2b.js:25` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_sb` · `b2b.js:34` · data-ce-act: nessuna · doppioni: `p2p-market.js:49` · denaro: no
- `_uid` · `b2b.js:35` · data-ce-act: nessuna · doppioni: `p2p-market.js:50` · denaro: no
- `_b2bFetchContracts` · `b2b.js:39` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_b2b_contracts`)
- `_b2bFetchActive` · `b2b.js:45` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `b2bRefresh` · `b2b.js:56` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `b2bLockedVehicleIds` · `b2b.js:63` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `b2bAcceptContract` · `b2b.js:72` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_accept_b2b_contract`)
- `b2bTerminateContract` · `b2b.js:110` · data-ce-act: `b2bTerminateContract` (`b2b.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer, addReputation`) / RPC (`rpc_terminate_b2b_contract`)
- `_b2bDailyTick` · `b2b.js:141` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`accreditatoDalServer, addReputation`) / RPC (`rpc_b2b_daily_tick`)
- `b2bOpenAcceptModal` · `b2b.js:173` · data-ce-act: `b2bOpenAcceptModal` (`b2b.js`) · doppioni: nessuno · denaro: no
- `b2bCheckLimit` · `b2b.js:254` · data-ce-act: `b2bCheckLimit` (`b2b.js`) · doppioni: nessuno · denaro: no
- `b2bConfirmAccept` · `b2b.js:273` · data-ce-act: `b2bConfirmAccept` (`b2b.js`) · doppioni: nessuno · denaro: no
- `renderTabB2B` · `b2b.js:289` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `b2bInit` · `b2b.js:439` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `contracts.js`

- `_cCountQualifying` · `contracts.js:127` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_cPlayerScore` · `contracts.js:134` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_cAIScore` · `contracts.js:144` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `CE_Contracts` · `contracts.js:153` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`earn`)
- `_usedIds` · `contracts.js:158` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_generateBatch` · `contracts.js:164` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_resolve` · `contracts.js:182` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`earn`)
- `_collectEarnings` · `contracts.js:214` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`earn`)
- `_expireContracts` · `contracts.js:221` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `CE_placeBid` · `contracts.js:259` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`spend, earn`)
- `CE_cancelBid` · `contracts.js:276` · data-ce-act: `CE_cancelBid` (`contracts.js`) · doppioni: nessuno · denaro: CE_money (`earn`)
- `CE_terminateContract` · `contracts.js:289` · data-ce-act: `CE_terminateContract` (`contracts.js`) · doppioni: nessuno · denaro: no
- `CE_updateBidPreview` · `contracts.js:298` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabContracts` · `contracts.js:311` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_tierBorderColor` · `contracts.js:414` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderTenderCard` · `contracts.js:418` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderContractCard` · `contracts.js:487` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `nemesis.js`

- `_nemesisAddVip` · `nemesis.js:10` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_nemesisTick` · `nemesis.js:51` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_nemesisFundRival` · `nemesis.js:66` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_nemesis_fund_rival`)
- `_nemesisBribeVip` · `nemesis.js:101` · data-ce-act: `_nemesisBribeVip` (`nemesis.js`) · doppioni: nessuno · denaro: CE_money (`spend`)
- `renderTabNemesis` · `nemesis.js:130` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_renderNemesisCard` · `nemesis.js:170` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `black_ops.js`

- `_sErr` · `black_ops.js:80` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `shadowRefresh` · `black_ops.js:88` · data-ce-act: nessuna · doppioni: nessuno · denaro: RPC (`rpc_get_shadow_targets, rpc_get_shadow_ops_log`)
- `shadowExecuteOp` · `black_ops.js:102` · data-ce-act: `shadowExecuteOp` (`black_ops.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_execute_shadow_op`)
- `shadowUpgradeDefense` · `black_ops.js:160` · data-ce-act: `shadowUpgradeDefense` (`black_ops.js`) · doppioni: nessuno · denaro: CE_money (`addebitatoDalServer`) / RPC (`rpc_upgrade_shadow_defense`)
- `renderTabShadow` · `black_ops.js:189` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `shadowInit` · `black_ops.js:273` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `vip-clients.js`

- `_maybeVipGrigori` · `vip-clients.js:11` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipGrigori` · `vip-clients.js:33` · data-ce-act: `acceptVipGrigori` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteGrigori` · `vip-clients.js:51` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`earn, addReputation`)
- `vipGrigoriEventAccept` · `vip-clients.js:74` · data-ce-act: `vipGrigoriEventAccept` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`spend`)
- `vipGrigoriEventDecline` · `vip-clients.js:86` · data-ce-act: `vipGrigoriEventDecline` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`addReputation`)
- `_maybeVipStrata` · `vip-clients.js:95` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipStrata` · `vip-clients.js:116` · data-ce-act: `acceptVipStrata` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteStrata` · `vip-clients.js:132` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`spend`)
- `_maybeVipPlatinum` · `vip-clients.js:155` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipPlatinum` · `vip-clients.js:176` · data-ce-act: `acceptVipPlatinum` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompletePlatinum` · `vip-clients.js:192` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `vipPlatinumEventBlock` · `vip-clients.js:206` · data-ce-act: `vipPlatinumEventBlock` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`spend`)
- `vipPlatinumEventAllow` · `vip-clients.js:217` · data-ce-act: `vipPlatinumEventAllow` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`addReputation`)
- `_maybeVipOnorevole` · `vip-clients.js:229` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipOnorevole` · `vip-clients.js:252` · data-ce-act: `acceptVipOnorevole` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteOnorevole` · `vip-clients.js:270` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `vipOnorevoleEventCopera` · `vip-clients.js:285` · data-ce-act: `vipOnorevoleEventCopera` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`spend`)
- `vipOnorevoleEventResisti` · `vip-clients.js:301` · data-ce-act: `vipOnorevoleEventResisti` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`addReputation`)
- `_maybeVipEmiro` · `vip-clients.js:313` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipEmiro` · `vip-clients.js:335` · data-ce-act: `acceptVipEmiro` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteEmiro` · `vip-clients.js:352` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`earn`)
- `_maybeVipGolden` · `vip-clients.js:369` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipGolden` · `vip-clients.js:390` · data-ce-act: `acceptVipGolden` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteGolden` · `vip-clients.js:406` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_maybeVipTechBro` · `vip-clients.js:440` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipTechBro` · `vip-clients.js:463` · data-ce-act: `acceptVipTechBro` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteTechBro` · `vip-clients.js:481` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_maybeVipGarante` · `vip-clients.js:489` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipGarante` · `vip-clients.js:510` · data-ce-act: `acceptVipGarante` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteGarante` · `vip-clients.js:526` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `vipGaranteEventPaga` · `vip-clients.js:548` · data-ce-act: `vipGaranteEventPaga` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`spend`)
- `vipGaranteEventIntimidisci` · `vip-clients.js:562` · data-ce-act: `vipGaranteEventIntimidisci` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`spend`)
- `_maybeVipWedding` · `vip-clients.js:587` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipWedding` · `vip-clients.js:609` · data-ce-act: `acceptVipWedding` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteWedding` · `vip-clients.js:627` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `vipWeddingEventGestisci` · `vip-clients.js:653` · data-ce-act: `vipWeddingEventGestisci` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`spend, earn`)
- `vipWeddingEventIgnora` · `vip-clients.js:665` · data-ce-act: `vipWeddingEventIgnora` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`addReputation`)
- `vipWeddingPaymentCollect` · `vip-clients.js:674` · data-ce-act: `vipWeddingPaymentCollect` (`ui-emails.js`) · doppioni: nessuno · denaro: CE_money (`earn`)
- `_maybeVipErede` · `vip-clients.js:690` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `acceptVipErede` · `vip-clients.js:712` · data-ce-act: `acceptVipErede` (`ui-emails.js`) · doppioni: nessuno · denaro: no
- `_vipCompleteErede` · `vip-clients.js:729` · data-ce-act: nessuna · doppioni: nessuno · denaro: CE_money (`earn, addReputation`)
- `_vipOnComplete` · `vip-clients.js:758` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `vip-buffs.js`

- `_applyBuff` · `vip-buffs.js:21` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_getBuffValue` · `vip-buffs.js:29` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_pruneExpiredBuffs` · `vip-buffs.js:37` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipBuffTick` · `vip-buffs.js:48` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipCooldownOk` · `vip-buffs.js:52` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipSetCooldown` · `vip-buffs.js:58` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipMailDot` · `vip-buffs.js:63` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipRandomPoi` · `vip-buffs.js:68` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipRandomRoute` · `vip-buffs.js:73` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipPushEmail` · `vip-buffs.js:81` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipResolveEmail` · `vip-buffs.js:86` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipRefreshUI` · `vip-buffs.js:91` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipCreateRide` · `vip-buffs.js:96` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipFleetCar` · `vip-buffs.js:108` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vipAssignedDriver` · `vip-buffs.js:120` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `showroom.js`

- `_srmFuelGroup` · `showroom.js:52` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmBrand` · `showroom.js:58` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmCatalog` · `showroom.js:103` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmVehicle` · `showroom.js:106` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmTierColor` · `showroom.js:109` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmTotalPrice` · `showroom.js:117` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmComputeStats` · `showroom.js:127` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmOptCount` · `showroom.js:137` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmInjectStyles` · `showroom.js:142` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabShowroom` · `showroom.js:311` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmClose` · `showroom.js:333` · data-ce-act: `_srmClose` (`showroom.js`) · doppioni: nessuno · denaro: no
- `_srmRenderGallery` · `showroom.js:343` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmFilterFuel` · `showroom.js:421` · data-ce-act: `_srmFilterFuel` (`showroom.js`) · doppioni: nessuno · denaro: no
- `_srmFilterBrand` · `showroom.js:428` · data-ce-act: `_srmFilterBrand` (`showroom.js`) · doppioni: nessuno · denaro: no
- `_srmOpenConfig` · `showroom.js:435` · data-ce-act: `_srmOpenConfig` (`showroom.js`) · doppioni: nessuno · denaro: no
- `_srmRenderConfig` · `showroom.js:448` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmSectionContent` · `showroom.js:499` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmBackToGallery` · `showroom.js:594` · data-ce-act: `_srmBackToGallery` (`showroom.js`) · doppioni: nessuno · denaro: no
- `_srmGetArg` · `showroom.js:603` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmSetSection` · `showroom.js:611` · data-ce-act: `_srmSetSection` (`showroom.js`) · doppioni: nessuno · denaro: no
- `_srmToggle` · `showroom.js:628` · data-ce-act: `_srmToggle` (`showroom.js`) · doppioni: nessuno · denaro: no
- `_srmAnimatePrice` · `showroom.js:672` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_srmPurchase` · `showroom.js:695` · data-ce-act: `_srmPurchase` (`showroom.js`) · doppioni: nessuno · denaro: CE_money (`spend`)

## `vanity.js`

- `_ensure` · `vanity.js:28` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_applyBrand` · `vanity.js:38` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabPrestigio` · `vanity.js:45` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vanityEmblem` · `vanity.js:125` · data-ce-act: `_vanityEmblem` (`vanity.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_vanityColor` · `vanity.js:137` · data-ce-act: `_vanityColor` (`vanity.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_vanityTitle` · `vanity.js:149` · data-ce-act: `_vanityTitle` (`vanity.js`) · doppioni: nessuno · denaro: CE_money (`spendDC`)
- `_save` · `vanity.js:160` · data-ce-act: nessuna · doppioni: `security.js:82` · denaro: no

## `war_room.js`

- `_wrProject` · `war_room.js:65` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrRingToD` · `war_room.js:73` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrFeatureToPath` · `war_room.js:80` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrFeatureCentroid` · `war_room.js:89` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrGetSvgId` · `war_room.js:104` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrLoadGeo` · `war_room.js:110` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrGeoToSVG` · `war_room.js:120` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrFill` · `war_room.js:154` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrStroke` · `war_room.js:161` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrStrokeW` · `war_room.js:167` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrInjectStyles` · `war_room.js:174` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderTabWarRoom` · `war_room.js:240` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrClose` · `war_room.js:354` · data-ce-act: `_wrClose` (`war_room.js`) · doppioni: nessuno · denaro: no
- `_wrSetupInteractions` · `war_room.js:363` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrShowSidebar` · `war_room.js:382` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_wrAcquire` · `war_room.js:477` · data-ce-act: `_wrAcquire` (`war_room.js`) · doppioni: nessuno · denaro: no

## `hq.js`

- `_hqNascondiNavigazione` · `hq.js:13` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hqInit` · `hq.js:23` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hqGetCityRooms` · `hq.js:66` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hqHasRoomInCity` · `hq.js:71` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hqGetRoomLevel` · `hq.js:76` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hqAllEffects` · `hq.js:82` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hqUpgradeRoom` · `hq.js:116` · data-ce-act: `hqUpgradeRoom` (`hq.js`) · doppioni: nessuno · denaro: CE_money (`spend, addReputation`)
- `hqSwitchCity` · `hq.js:197` · data-ce-act: `hqSwitchCity` (`hq.js`) · doppioni: nessuno · denaro: no
- `renderTabHQ` · `hq.js:204` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_hqDailyTick` · `hq.js:339` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_hqBuildFromList` · `hq.js:373` · data-ce-act: `_hqBuildFromList` (`hq.js`) · doppioni: nessuno · denaro: no

## `hq-visual.js`

- `renderHQCampus` · `hq-visual.js:7` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hqOpenBuildModalSlot` · `hq-visual.js:87` · data-ce-act: `hqOpenBuildModalSlot` (`hq-visual.js`) · doppioni: nessuno · denaro: no
- `hqShowInfoPanel` · `hq-visual.js:138` · data-ce-act: `hqShowInfoPanel` (`hq-visual.js`) · doppioni: nessuno · denaro: no

## `quests.js`

- `completeMissionRun` · `quests.js:7` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `getMissionRequires` · `quests.js:15` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `checkQuestProgress` · `quests.js:20` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `claimQuestReward` · `quests.js:46` · data-ce-act: `claimQuestReward` (`ui-career.js`) · doppioni: nessuno · denaro: CE_money (`earn, earnDC, addReputation`) / RPC (`rpc_award_mission_vtk`)

## `daily-orders.js`

- `_tier` · `daily-orders.js:12` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_availableDB` · `daily-orders.js:60` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_today` · `daily-orders.js:69` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `ensure` · `daily-orders.js:72` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `tpl` · `daily-orders.js:92` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `getTarget` · `daily-orders.js:94` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `getRw` · `daily-orders.js:98` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `progressOf` · `daily-orders.js:102` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `rwLabel` · `daily-orders.js:111` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `claimDailyOrder` · `daily-orders.js:118` · data-ce-act: `claimDailyOrder` (`daily-orders.js`) · doppioni: nessuno · denaro: CE_money (`earnDC, earn, addReputation`)
- `renderDailyOrdersHTML` · `daily-orders.js:172` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

## `vittorio.js`

- `gs` · `vittorio.js:24` · data-ce-act: nessuna · doppioni: `objective-tracker.js:15` · denaro: no
- `fmt` · `vittorio.js:25` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `ensureDebt` · `vittorio.js:28` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `_vittorioDebt` · `vittorio.js:40` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `nag` · `vittorio.js:48` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `dailyTick` · `vittorio.js:54` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `repayVittorio` · `vittorio.js:72` · data-ce-act: `repayVittorio` (`vittorio.js`) · doppioni: nessuno · denaro: no
- `flipVittorio` · `vittorio.js:100` · data-ce-act: `flipVittorio` (`vittorio.js`) · doppioni: nessuno · denaro: no
- `openVittorioModal` · `vittorio.js:116` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `openModal` · `vittorio.js:117` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `closeModal` · `vittorio.js:143` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `refresh` · `vittorio.js:146` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `hookDaily` · `vittorio.js:149` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `processDailyRoutines` · `vittorio.js:153` · data-ce-act: nessuna · doppioni: `engine-daily.js:315` · denaro: no

## `driver_skills.js`

- `driverSkillTree` · `driver_skills.js:92` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `driverHasSkill` · `driver_skills.js:97` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `driverSkillEffect` · `driver_skills.js:101` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `driverAllEffects` · `driver_skills.js:117` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `driverAwardSkillPoint` · `driver_skills.js:134` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `driverSelectBranch` · `driver_skills.js:141` · data-ce-act: `driverSelectBranch` (`driver_skills.js`) · doppioni: nessuno · denaro: no
- `driverUnlockSkill` · `driver_skills.js:158` · data-ce-act: `driverUnlockSkill` (`driver_skills.js`) · doppioni: nessuno · denaro: no
- `driverPermadeathRoll` · `driver_skills.js:197` · data-ce-act: nessuna · doppioni: nessuno · denaro: no
- `renderDriverSkillModal` · `driver_skills.js:238` · data-ce-act: `renderDriverSkillModal` (`ui-staff.js`) · doppioni: nessuno · denaro: no
- `driverSkillsInit` · `driver_skills.js:328` · data-ce-act: nessuna · doppioni: nessuno · denaro: no

---

## Nomi definiti due volte (collisioni / doppioni)

| Nome | Definizione 1 | Definizione 2 / altre | Note |
|---|---|---|---|
| `_sb` | `p2p-market.js:49` | `b2b.js:34` | Helper locali identici definiti in scope globale |
| `_uid` | `p2p-market.js:50` | `b2b.js:35` | Helper locali identici definiti in scope globale |
| `listCarForSale` | `p2p-market.js:60` | `engine-fleet.js:414` | P2P market (`p2p-market.js`) sovrascrive la vendita flotta standard (`engine-fleet.js`) |
| `_rpc` | `alliances.js:286` | `serverState.js:370` |  |
| `_sb` | `b2b.js:34` | `p2p-market.js:49` | Helper locali identici definiti in scope globale |
| `_uid` | `b2b.js:35` | `p2p-market.js:50` | Helper locali identici definiti in scope globale |
| `_save` | `vanity.js:160` | `security.js:82` |  |
| `gs` | `vittorio.js:24` | `objective-tracker.js:15` |  |
| `processDailyRoutines` | `vittorio.js:153` | `engine-daily.js:315` | Hook routine giornaliere sovrascritto / decorato |

---

## Funzioni che nessuno chiama (codice morto)

| Funzione | Definizione | Note |
|---|---|---|
| `getMissionRequires` | `quests.js:15` | Helper requisiti missione non referenziato |
| `driverSkillEffect` | `driver_skills.js:101` | Calcolo effetto skill non referenziato |

