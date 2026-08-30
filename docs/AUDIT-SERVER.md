# Audit del server — una riga per funzione

> Generato da `npm run audit` leggendo il **database vivo**, non i file .sql del
> repo. Rigenerarlo dopo ogni migrazione. Il piano che lo governa è
> `PIANO-CHIUSURA.md` (Fase 1).

Aggiornato: 30/08/26, 22:19

| | |
|---|---|
| Funzioni in `public` | **166** |
| Chiamate dal browser | 141 |
| Su una sveglia | 9 |
| Con qualcosa da guardare | **20** |
| Chiamate dal client che sul server non esistono | **0** |

## Da guardare

Il verdetto sta in `scripts/audit-server.mjs` (mappa `VERDETTI`) e non qui,
perché questo documento si rigenera e si porterebbe via ciò che scrivi a mano.

- `rpc_advance_time` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Il tempo lo tiene il client; il mondo condiviso si muove coi cron. Avanzo.**
- `rpc_b2b_sla_event` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **La penale SLA del B2B non è mai stata collegata: un guasto in corsa non abbassa il punteggio del contratto. Da guardare quando tocca al sistema B2B (fase 3).**
- `rpc_claim_daily_reward` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Lasciata aperta ad `authenticated` ma inutilizzata: il premio giornaliero lo calcola il browser. Le due tabelle dei premi non coincidono → DOMANDE-PER-VLAD.md §5.**
- `rpc_cleanup_expired_listings` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Chiusa a tutti (71). NON va schedulata finché cancella invece di restituire: l'annuncio scaduto è l'unico modo che ha il venditore di riavere l'auto.**
- `rpc_credit_dc_purchase` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **La chiama Stripe, non il gioco: è già ristretta a `service_role` e la catena dell'acquisto va provata con una carta vera → DOMANDE-PER-VLAD.md §1.**
- `rpc_dismiss_dispatch` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Stessa coda `dispatches` mai usata.**
- `rpc_earn` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Avanzo del cancello del denaro precedente: oggi tutto passa da `CE_money` → `rpc_sync_cash`. Da togliere quando si sarà sicuri che nessuno la usi.**
- `rpc_expire_tourism_contracts` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Chiusa a tutti (72). Involucro di `_process_tourism_tenders`, che il cron `bandi-turistici` chiama già per conto suo.**
- `rpc_generate_dispatch` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Le corse le genera il motore locale. La coda `dispatches` lato server non è mai stata usata dal gioco.**
- `rpc_get_hq_leaderboard` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **HQ è spento (`HQ_ENABLED = false` in config.js). Coerente.**
- `rpc_invite_to_alliance` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Gli inviti ai consorzi esistono sul server e non hanno interfaccia: si entra solo dalla lista pubblica. Da guardare col sistema consorzi (fase 3).**
- `rpc_nemesis_bribe_vip` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Superata: `_nemesisBribeVip` paga la corruzione con `CE_money.spend`, che passa già dal server. Doppione da togliere quando si chiude il sistema nemesi (fase 3).**
- `rpc_nemesis_fund_rival` — **la chiama il browser (nemesis.js) ma `authenticated` non può eseguirla**
  · **Resta revocata: regala €50.000 a un altro giocatore, 5 volte l'ora, e l'unico controllo è «non a te stesso». Due account d'accordo stampano denaro. `nemesis.js` la chiama e incassa il rifiuto senza rompersi → DOMANDE-PER-VLAD.md §7.**
- `rpc_read_message` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **La posta di gioco vive nel salvataggio locale, non in una tabella.**
- `rpc_respond_invite` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Metà mancante degli inviti ai consorzi (vedi sopra).**
- `rpc_save_game_state` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Il salvataggio passa da `ServerState`, non da qui. Avanzo.**
- `rpc_spend` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Come `rpc_earn`: stessa architettura precedente, stesso destino.**
- `rpc_update_fuel_price` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Chiusa a tutti (71). Non schedulata: `fuel_market` non la legge nessuno, il prezzo del gasolio è locale (engine-daily.js). Decisione di gioco → DOMANDE-PER-VLAD.md §6.**
- `rpc_update_hq_status` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **HQ è spento (`HQ_ENABLED = false`). Coerente.**
- `rpc_update_weather` — non la chiama nessuno: né browser né sveglia né un'altra funzione
  · **Il meteo vero arriva dalla Edge Function `fetch-weather` in `real_world_status`. Avanzo.**

## Tutte le funzioni

Legenda — **Chi**: chi può eseguirla · **Scrive**: `€` cambia denaro, `sì` cambia
altro, `no` legge soltanto · **Guardia**: contiene `auth.uid()` o
`_my_company_id()` · **Chiamata da**: file del browser e sveglie.

| Funzione | Chi | Scrive | Guardia | Chiamata da |
|---|---|---|---|---|
| `_add_player_cash` | solo server | no | — | rpc_buy_company_shares(), rpc_buy_market_car(), rpc_contribute_consorzio(), rpc_contribute_holding_treasury(), rpc_daily_dividends(), rpc_gdf_inspection_check(), rpc_list_company_ipo(), rpc_pay_don_carmine(), rpc_sell_company_shares() |
| `_alliance_count` | trigger | no | — | trigger:trg_alliance_count |
| `_apply_province_transit_tax` | solo server | no | — | — |
| `_apply_territory_taxes` | solo server | no | — | rpc_claim_trip_reward() |
| `_audit_leaderboard_anomaly` | trigger | sì | — | trigger:trg_audit_leaderboard |
| `_audit_save_anomaly` | trigger | € | — | trigger:trg_audit_save |
| `_ce_rate_limit` | solo server | sì | sì | rpc_add_driver_coins(), rpc_add_driver_coins(), rpc_award_mission_vtk(), rpc_claim_trip_reward(), rpc_contribute_consorzio(), rpc_donate_to_alliance(), rpc_nemesis_fund_rival(), rpc_pay_majority_dividend(), rpc_post_global_chat(), rpc_send_direct_message(), rpc_send_friend_request(), rpc_spend_vtk_shop_item(), rpc_start_trip(), rpc_sync_cash(), rpc_vote_server_decree() |
| `_check_opa_threshold` | solo server | sì | — | _trg_check_opa() |
| `_detect_leaderboard_anomaly` | trigger | sì | — | trigger:trg_detect_anomaly |
| `_econ_cap` | solo server | € | — | rpc_earn(), rpc_sync_cash() |
| `_flag_cheat` | solo server | sì | — | rpc_list_car_for_sale(), rpc_place_auction_bid() |
| `_get_player_cash` | solo server | no | — | rpc_buy_company_shares(), rpc_buy_market_car(), rpc_contribute_consorzio(), rpc_contribute_holding_treasury(), rpc_gdf_inspection_check(), rpc_list_company_ipo(), rpc_pay_don_carmine() |
| `_my_company_id` | chiunque | no | sì | rpc_add_driver_coins(), rpc_advance_time(), rpc_buy_auto_rest(), rpc_buy_energy_refill(), rpc_buy_fleet_repair(), rpc_buy_vip_contact(), rpc_dismiss_dispatch(), rpc_generate_dispatch(), rpc_ping(), rpc_process_offline_gains(), rpc_read_message(), rpc_update_weather(), rpc_upgrade_offline_limit() |
| `_process_judicial_auctions` | solo server | € | — | cron:aste-giudiziarie |
| `_process_tourism_tenders` | solo server | € | — | cron:bandi-turistici, rpc_expire_tourism_contracts(), rpc_get_tourism_tenders() |
| `_refresh_region_governor` | solo server | sì | — | _trg_province_governor_refresh(), rpc_acquire_province() |
| `_set_updated_at` | trigger | no | — | trigger:trg_companies_updated_at, trigger:trg_company_shares_updated_at, trigger:trg_drivers_updated_at, trigger:trg_holdings_updated_at, trigger:trg_vehicles_updated_at |
| `_sync_leaderboard_from_company` | trigger | € | — | trigger:trg_sync_leaderboard |
| `_trg_check_opa` | trigger | sì | — | trigger:trg_opa_check |
| `_trg_province_governor_refresh` | trigger | sì | — | trigger:trg_province_owner_change |
| `_trim_global_news` | trigger | sì | — | trigger:trg_trim_news |
| `rls_auto_enable` | chiunque | no | — | — |
| `rpc_accept_b2b_contract` | chiunque | sì | sì | b2b.js |
| `rpc_acquire_province` | chiunque | € | sì | serverState.js |
| `rpc_activate_alliance_perk` | chiunque | no | sì | alliances.js |
| `rpc_activate_alliance_perk` | chiunque | no | sì | alliances.js |
| `rpc_add_driver_coins` | chiunque | € | sì | serverState.js |
| `rpc_add_driver_coins` | chiunque | € | sì | serverState.js |
| `rpc_add_province_influence` | chiunque | sì | sì | serverState.js |
| `rpc_advance_time` | chiunque | no | sì | — |
| `rpc_award_mission_vtk` | con account | € | sì | quests.js |
| `rpc_b2b_daily_tick` | chiunque | no | sì | b2b.js |
| `rpc_b2b_sla_event` | chiunque | no | sì | — |
| `rpc_broadcast_news` | con account | sì | sì | engine.js |
| `rpc_buy_auto_rest` | chiunque | no | sì | serverState.js |
| `rpc_buy_company_shares` | chiunque | € | sì | p2p-market.js |
| `rpc_buy_crypto` | chiunque | € | sì | crypto.js |
| `rpc_buy_energy_refill` | chiunque | no | sì | serverState.js |
| `rpc_buy_fleet_repair` | chiunque | no | sì | serverState.js |
| `rpc_buy_fuel_depot` | chiunque | € | sì | infrastructure.js |
| `rpc_buy_hr_automation` | chiunque | no | sì | serverState.js |
| `rpc_buy_investment` | chiunque | € | sì | serverState.js |
| `rpc_buy_market_car` | chiunque | € | sì | p2p-market.js |
| `rpc_buy_real_estate` | chiunque | € | sì | serverState.js |
| `rpc_buy_vehicle` | chiunque | € | sì | serverState.js |
| `rpc_buy_vehicle_upgrade` | chiunque | no | sì | serverState.js |
| `rpc_buy_vip_contact` | chiunque | no | sì | serverState.js |
| `rpc_cancel_listing` | chiunque | sì | sì | p2p-market.js |
| `rpc_cancel_tourism_bid` | chiunque | no | sì | tourism.js |
| `rpc_cancel_vtk_order` | chiunque | no | sì | vtk-market.js |
| `rpc_claim_auction` | chiunque | no | sì | auctions.js |
| `rpc_claim_daily_reward` | chiunque | € | sì | — |
| `rpc_claim_trip_reward` | chiunque | € | sì | serverState.js |
| `rpc_cleanup_expired_listings` | solo server | sì | — | — |
| `rpc_collect_daily_costs` | chiunque | € | sì | serverState.js |
| `rpc_contribute_consorzio` | chiunque | sì | sì | p2p-render.js |
| `rpc_contribute_holding_treasury` | chiunque | no | sì | p2p-market.js |
| `rpc_create_alliance` | chiunque | sì | sì | alliances.js |
| `rpc_create_consorzio` | chiunque | sì | sì | p2p-render.js |
| `rpc_create_holding` | chiunque | sì | sì | p2p-market.js |
| `rpc_credit_dc_purchase` | solo server | € | — | — |
| `rpc_credit_real_estate_rents` | solo server | no | — | cron:affitti-immobili |
| `rpc_daily_dividends` | con account | no | — | engine-holding.js, cron:dividendi-giornalieri-holding |
| `rpc_dampen_tension` | solo server | no | — | rpc_contribute_holding_treasury() |
| `rpc_deposit_offshore` | chiunque | € | sì | crypto.js |
| `rpc_disband_alliance` | chiunque | sì | sì | alliances.js |
| `rpc_dismiss_dispatch` | chiunque | sì | sì | — |
| `rpc_donate_to_alliance` | chiunque | sì | sì | alliances.js |
| `rpc_due_push_subscriptions` | solo server | no | — | edge:send-push |
| `rpc_earn` | chiunque | € | sì | — |
| `rpc_ec_spend` | chiunque | € | sì | serverState.js |
| `rpc_execute_shadow_op` | chiunque | € | sì | black_ops.js |
| `rpc_expire_tourism_contracts` | solo server | € | — | — |
| `rpc_fill_vtk_order` | chiunque | no | sì | vtk-market.js |
| `rpc_fire_driver` | chiunque | sì | sì | serverState.js |
| `rpc_gdf_inspection_check` | chiunque | no | sì | p2p-market.js |
| `rpc_generate_dispatch` | chiunque | sì | sì | — |
| `rpc_get_active_decrees` | chiunque | no | — | ui-lifestyle.js |
| `rpc_get_active_global_events` | chiunque | no | — | global_events.js |
| `rpc_get_b2b_contracts` | chiunque | no | — | b2b.js |
| `rpc_get_crypto_portfolio` | chiunque | no | sì | crypto.js |
| `rpc_get_fuel_depots` | chiunque | no | sì | infrastructure.js |
| `rpc_get_gdf_risk` | chiunque | no | sì | p2p-market.js |
| `rpc_get_hostile_takeovers` | chiunque | no | sì | hostile_takeover.js |
| `rpc_get_hq_leaderboard` | chiunque | no | — | — |
| `rpc_get_judicial_auctions` | chiunque | no | sì | auctions.js |
| `rpc_get_my_bids` | chiunque | no | sì | auctions.js |
| `rpc_get_my_influence` | chiunque | no | sì | serverState.js |
| `rpc_get_real_weather` | chiunque | no | — | weather_real.js |
| `rpc_get_server_decrees` | chiunque | no | sì | ui-lifestyle.js |
| `rpc_get_shadow_ops_log` | chiunque | no | sì | black_ops.js |
| `rpc_get_shadow_targets` | chiunque | no | sì | black_ops.js |
| `rpc_get_territory_snapshot` | chiunque | no | sì | serverState.js |
| `rpc_get_tourism_tenders` | chiunque | € | sì | tourism.js |
| `rpc_get_vtk_market_orders` | chiunque | no | sì | vtk-market.js |
| `rpc_get_won_auctions` | chiunque | no | sì | auctions.js |
| `rpc_hire_crumiri` | chiunque | sì | sì | p2p-render.js |
| `rpc_hire_driver` | chiunque | € | sì | serverState.js |
| `rpc_init_company` | chiunque | € | sì | serverState.js |
| `rpc_invite_to_alliance` | chiunque | sì | sì | — |
| `rpc_join_alliance` | chiunque | sì | sì | alliances.js |
| `rpc_join_consorzio` | chiunque | sì | sì | p2p-render.js |
| `rpc_join_holding` | chiunque | sì | sì | p2p-market.js |
| `rpc_kick_member` | chiunque | sì | sì | alliances.js |
| `rpc_leave_alliance` | chiunque | sì | sì | alliances.js |
| `rpc_leave_consorzio` | chiunque | sì | sì | p2p-render.js |
| `rpc_leave_holding` | chiunque | sì | sì | p2p-market.js |
| `rpc_list_car_for_sale` | chiunque | sì | sì | p2p-market.js |
| `rpc_list_company_ipo` | chiunque | sì | sì | p2p-market.js |
| `rpc_mark_dm_read` | chiunque | no | sì | social.js |
| `rpc_nemesis_bribe_vip` | chiunque | no | sì | — |
| `rpc_nemesis_fund_rival` | solo server | € | sì | nemesis.js |
| `rpc_opa_buyback` | chiunque | € | sì | hostile_takeover.js |
| `rpc_pay_don_carmine` | chiunque | sì | sì | p2p-render.js |
| `rpc_pay_fuel_levy` | chiunque | no | sì | engine-rides.js |
| `rpc_pay_majority_dividend` | chiunque | sì | sì | engine-rides.js |
| `rpc_ping` | chiunque | no | sì | auth.js |
| `rpc_place_auction_bid` | chiunque | € | sì | auctions.js |
| `rpc_place_vtk_sell_order` | chiunque | € | sì | vtk-market.js |
| `rpc_post_alliance_chat` | chiunque | sì | sì | alliances.js, social.js |
| `rpc_post_global_chat` | chiunque | sì | sì | social.js |
| `rpc_process_offline_gains` | chiunque | no | sì | auth.js |
| `rpc_purchase_dc_pack` | chiunque | no | — | serverState.js |
| `rpc_read_message` | chiunque | no | sì | — |
| `rpc_refuel_vehicle` | chiunque | no | sì | serverState.js |
| `rpc_remove_friend` | chiunque | sì | sì | social.js |
| `rpc_repair_vehicle` | chiunque | no | sì | serverState.js |
| `rpc_repay_loan` | chiunque | € | sì | serverState.js |
| `rpc_reset_daily_vtk` | solo server | no | — | cron:azzera-vtk-giornaliero |
| `rpc_resolve_auction` | solo server | no | — | _process_judicial_auctions() |
| `rpc_respond_friend_request` | chiunque | sì | sì | social.js |
| `rpc_respond_invite` | chiunque | sì | sì | — |
| `rpc_rest_ceo` | chiunque | no | sì | serverState.js |
| `rpc_save_game_state` | chiunque | sì | sì | — |
| `rpc_sell_company_shares` | chiunque | sì | sì | p2p-market.js |
| `rpc_sell_crypto` | chiunque | € | sì | crypto.js |
| `rpc_sell_vehicle` | chiunque | € | sì | serverState.js |
| `rpc_send_direct_message` | chiunque | sì | sì | social.js |
| `rpc_send_friend_request` | chiunque | sì | sì | social.js |
| `rpc_set_fuel_markup` | chiunque | no | sì | infrastructure.js |
| `rpc_set_member_role` | chiunque | no | sì | alliances.js |
| `rpc_spawn_judicial_auction` | solo server | € | — | _process_judicial_auctions() |
| `rpc_spend` | chiunque | € | sì | — |
| `rpc_spend_vtk_shop_item` | chiunque | sì | sì | vtk-market.js |
| `rpc_start_marketing_campaign` | chiunque | sì | sì | serverState.js |
| `rpc_start_trip` | chiunque | € | sì | serverState.js |
| `rpc_stop_marketing_campaign` | chiunque | sì | sì | serverState.js |
| `rpc_submit_tourism_bid` | chiunque | sì | sì | tourism.js |
| `rpc_sync_cash` | chiunque | € | sì | serverState.js, _econ_cap() |
| `rpc_sync_global_event_status` | con account | no | — | global_events.js, cron:stato-eventi-globali |
| `rpc_take_loan` | chiunque | € | sì | serverState.js |
| `rpc_terminate_b2b_contract` | chiunque | no | sì | b2b.js |
| `rpc_terminate_tourism_contract` | chiunque | sì | sì | tourism.js |
| `rpc_tick_tension` | con account | no | — | p2p-market.js, cron:tensione-sindacato |
| `rpc_toggle_telepass` | chiunque | no | sì | serverState.js |
| `rpc_tourism_daily_tick` | chiunque | no | sì | tourism.js |
| `rpc_unlock_region` | chiunque | € | sì | serverState.js |
| `rpc_update_fuel_price` | solo server | sì | — | — |
| `rpc_update_hq_status` | chiunque | sì | sì | — |
| `rpc_update_weather` | chiunque | no | sì | — |
| `rpc_upgrade_offline_limit` | chiunque | no | sì | serverState.js |
| `rpc_upgrade_shadow_defense` | chiunque | € | sì | black_ops.js |
| `rpc_vote_server_decree` | chiunque | sì | sì | ui-lifestyle.js |
| `rpc_withdraw_offshore` | chiunque | € | sì | crypto.js |
| `validate_game_save` | trigger | no | — | trigger:trg_validate_game_save |
| `validate_leaderboard` | trigger | no | — | trigger:trg_validate_leaderboard |
