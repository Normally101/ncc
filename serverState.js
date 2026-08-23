'use strict';
/* ============================================================================
   serverState.js — Chauffeur Empire · Server-Authoritative State Manager

   Architecture: MMO-style thin client
   ─ The client READS state from Supabase Realtime subscriptions.
   ─ The client WRITES state only via typed RPC calls (SECURITY DEFINER functions).
   ─ gameState.cash / gameState.fleet positions are kept in sync automatically.
   ─ Direct mutation of cash from engine.js is still supported as a LOCAL fallback
     while the full RPC migration of all game actions is in progress.
   ============================================================================ */

const ServerState = (() => {

    // ── Internal state ─────────────────────────────────────────────────────────
    let _supabase  = null;
    let _channel   = null;
    let _company   = null;   // companies row
    let _vehicles  = [];     // vehicles rows
    let _drivers   = [];     // drivers rows
    let _trips     = [];     // active_trips rows — server-tracked rides
    let _ready     = false;
    let _tripClaimTimer = null;
    let _lastServerCash = null;  // baseline for delta-based realtime cash sync (BUG 4)

    // ── Public: initialise after login ────────────────────────────────────────
    async function init(supabaseClient) {
        _supabase = supabaseClient;

        // Load snapshot
        await _loadSnapshot();

        // Wire up Realtime (requires Realtime enabled in Supabase Dashboard for each table)
        _subscribeRealtime();

        // Poll for completable trips every 5 s
        if (_tripClaimTimer) clearInterval(_tripClaimTimer);
        _tripClaimTimer = setInterval(_autoClaimReadyTrips, 5000);

        _ready = true;
        console.log('[ServerState] ✅ Init — company:', _company?.company_name,
                    '| cash: €' + _company?.cash, '| veicoli:', _vehicles.length,
                    '| autisti:', _drivers.length, '| viaggi attivi:', _trips.length);

        // Push authoritative values into the local gameState bridge
        _bridgeToGameState();

        // Sync live fuel price into gameState
        try {
            const liveFuelPrice = await getFuelPrice();
            if (liveFuelPrice && window.gameState) {
                gameState.fuelPrice = parseFloat(liveFuelPrice);
                console.log('[ServerState] ⛽ Fuel price:', gameState.fuelPrice);
            }
        } catch(e) {
            console.warn('[ServerState] Fuel price fetch failed (table may not exist yet):', e.message);
        }

        return getState();
    }

    // ── Snapshot load (called once on init) ────────────────────────────────────
    async function _loadSnapshot() {
        // Company
        const { data: co, error: coErr } = await _supabase
            .from('companies')
            .select('*')
            .maybeSingle();

        if (coErr) {
            console.warn('[ServerState] companies fetch error:', coErr.message);
        } else {
            _company = co;
        }

        if (!_company) {
            console.log('[ServerState] Nessuna azienda trovata — aspetto rpc_init_company.');
            return;
        }

        // Fleet, drivers, trips in parallel
        const [vRes, dRes, tRes] = await Promise.all([
            _supabase.from('vehicles').select('*'),
            _supabase.from('drivers').select('*'),
            _supabase.from('active_trips').select('*'),
        ]);

        if (vRes.error) console.warn('[ServerState] vehicles error:', vRes.error.message);
        else            _vehicles = vRes.data || [];

        if (dRes.error) console.warn('[ServerState] drivers error:', dRes.error.message);
        else            _drivers  = dRes.data || [];

        if (tRes.error) console.warn('[ServerState] active_trips error:', tRes.error.message);
        else            _trips    = tRes.data || [];
    }

    // ── Realtime subscription ──────────────────────────────────────────────────
    function _subscribeRealtime() {
        if (!_company) return;

        // Remove stale channel if reinitialising
        if (_channel) { _supabase.removeChannel(_channel); _channel = null; }

        _channel = _supabase
            .channel('ce_game_events')
            // companies: filter by user_id so we only see our own row
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'companies',
                  filter: `user_id=eq.${_company.user_id}` },
                _onCompanyChange)
            // vehicles / drivers / trips: filter by company_id
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'vehicles',
                  filter: `company_id=eq.${_company.id}` },
                _onVehicleChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'drivers',
                  filter: `company_id=eq.${_company.id}` },
                _onDriverChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'active_trips',
                  filter: `company_id=eq.${_company.id}` },
                _onTripChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'provinces' },
                () => { if (typeof renderTabProvinces === 'function' && _tabIs?.('provinces')) renderTabProvinces(); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'company_real_estate',
                  filter: `company_id=eq.${_company.id}` },
                () => { if (typeof renderTabRealEstate === 'function' && _tabIs?.('realestate')) renderTabRealEstate(); })
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'fuel_market' },
                (payload) => {
                    if (payload.new?.price_eur && window.gameState) {
                        gameState.fuelPrice = parseFloat(payload.new.price_eur);
                        if (typeof updateUI === 'function') updateUI();
                    }
                })
            .subscribe((status) => {
                console.log('[ServerState] Realtime:', status);
            });
    }

    // ── Realtime handlers ──────────────────────────────────────────────────────
    function _onCompanyChange(payload) {
        const { eventType, new: newRow } = payload;
        if (eventType === 'UPDATE' || eventType === 'INSERT') {
            // BUG 4 fix: apply only the server-side DELTA to local cash. The local
            // simulation is authoritative for cash (ride earnings, repairs, fines,
            // fuel are all mutated locally and mirrored to the server via syncCash).
            // Overwriting local cash here would revert every local earning/spend
            // accumulated since the last sync. Boot/full bridge stays authoritative.
            if (window.gameState && Number.isFinite(_lastServerCash) && Number.isFinite(newRow.cash)) {
                const delta = newRow.cash - _lastServerCash;
                if (delta !== 0) gameState.cash += delta;
            }
            _company = newRow;
            _bridgeToGameState({ skipCash: true });
            if (typeof updateUI === 'function') updateUI();
        }
    }

    function _onVehicleChange(payload) {
        _applyRowChange(_vehicles, payload, 'id');
        _bridgeFleetToGameState();
        if (typeof renderTabFleet === 'function' && _tabIs?.('fleet')) renderTabFleet();
    }

    function _onDriverChange(payload) {
        _applyRowChange(_drivers, payload, 'id');
        if (typeof renderTabStaff === 'function' && _tabIs?.('staff')) renderTabStaff();
    }

    function _onTripChange(payload) {
        _applyRowChange(_trips, payload, 'id');
        // If a trip was deleted (claimed), the local ride array may need reconciliation
        if (payload.eventType === 'DELETE') {
            const tripId = payload.old?.id;
            _reconcileLocalRideOnClaim(tripId);
        }
    }

    // Generic INSERT / UPDATE / DELETE applier for arrays keyed by `keyField`
    function _applyRowChange(arr, payload, keyField) {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
            arr.push(newRow);
        } else if (eventType === 'UPDATE') {
            const i = arr.findIndex(r => r[keyField] === newRow[keyField]);
            if (i >= 0) arr[i] = newRow; else arr.push(newRow);
        } else if (eventType === 'DELETE') {
            const idx = arr.findIndex(r => r[keyField] === oldRow[keyField]);
            if (idx >= 0) arr.splice(idx, 1);
        }
    }

    // ── Bridge: sync server state → local gameState ────────────────────────────
    // opts.skipCash=true → update everything EXCEPT cash (used by the realtime
    // delta handler, which manages cash itself). Always refreshes _lastServerCash
    // so subsequent realtime deltas are measured from the latest known server value.
    function _bridgeToGameState(opts) {
        if (!window.gameState || !_company) return;
        const skipCash = opts && opts.skipCash;
        _lastServerCash = _company.cash;

        // Authoritative financial fields — always trust the server
        if (!skipCash) gameState.cash   = _company.cash;
        gameState.driverCoins           = (_company.driver_coins  != null) ? _company.driver_coins  : (gameState.driverCoins ?? 0);
        gameState.vtkBalance            = (_company.vtk_balance   != null) ? _company.vtk_balance   : (gameState.vtkBalance  ?? 0);
        const _rep = parseFloat(_company.reputation);
        gameState.reputation            = Number.isFinite(_rep) ? _rep : gameState.reputation;
        gameState.companyName           = _company.company_name || gameState.companyName;
        gameState.hrAutomationExpiresAt = _company.hr_automation_expires_at || null;
    }

    function _bridgeFleetToGameState() {
        if (!window.gameState) return;

        // Sync server position / status for cars that have a matching local entry
        _vehicles.forEach(sv => {
            const localCar = gameState.fleet?.find(c => c._serverId === sv.id);
            if (localCar) {
                localCar.currentPoiId = sv.current_city;
                // Map server status to local status conventions
                if (sv.status === 'IDLE' && localCar.status === 'busy') {
                    // Server says idle but local thinks busy — ride must have been claimed
                    // (handled by _reconcileLocalRideOnClaim)
                }
            }
        });
    }

    // When the server deletes a trip (claim confirmed), ensure local ride is also removed
    function _reconcileLocalRideOnClaim(tripId) {
        if (!window.gameState || !tripId) return;
        const rideIdx = (gameState.activeRides || []).findIndex(r => r._serverId === tripId);
        if (rideIdx >= 0) {
            const ride = gameState.activeRides[rideIdx];
            console.log('[ServerState] Reconcile: rimozione corsa locale per trip', tripId);
            gameState.activeRides.splice(rideIdx, 1);
            // Free the local driver/car state if not already freed
            const driver = gameState.drivers?.find(d => d.id === ride.driverId);
            if (driver && driver.status === 'busy') driver.status = 'idle';
        }
    }

    // ── Auto-claim: poll for trips whose end_time has passed ──────────────────
    async function _autoClaimReadyTrips() {
        if (!_supabase || !_company) return;
        const now = Date.now();
        const ready = _trips.filter(t => new Date(t.end_time).getTime() <= now);
        for (const trip of ready) {
            await claimReward(trip.id);
        }
    }


    // ==========================================================================
    // RPC WRAPPERS — all server mutations go through here
    // ==========================================================================

    // ── rpc_init_company ──────────────────────────────────────────────────────
    async function initCompany(companyName) {
        _assertReady(false); // allow before _ready (called during setup)
        const { data, error } = await _supabase.rpc('rpc_init_company', {
            v_company_name: companyName,
        });
        if (error) { _handleRpcError('rpc_init_company', error); return null; }
        _company = data;
        _subscribeRealtime();      // resubscribe now that we have a company
        _bridgeToGameState();
        return data;
    }

    // ── rpc_buy_vehicle ───────────────────────────────────────────────────────
    // Drop-in replacement for the local "buy vehicle" action.
    // Returns the new vehicles row, or null on error (notification already shown).
    async function buyVehicle(modelId, price, hqCity) {
        _assertReady();
        await _ensureCompany();
        const { data, error } = await _supabase.rpc('rpc_buy_vehicle', {
            v_model_id: modelId,
            v_price:    price,
            v_hq_city:  hqCity || _company?.hq_city || 'roma',
        });
        if (error) { _handleRpcError('rpc_buy_vehicle', error); return null; }
        // Realtime will push the INSERT to _vehicles and UPDATE to _company.cash
        return data;
    }

    // ── rpc_start_trip ────────────────────────────────────────────────────────
    // Call this INSTEAD of (or after) the local startRide() to register the trip
    // on the server. Returns the active_trips row.
    //
    // vehicleServerId / driverServerId are the uuid PKs from the server tables.
    // For legacy local rides (before full migration), pass null → skips server call.
    async function startTrip(vehicleServerId, driverServerId, endCity, rewardCash, durationMs, isEmptyReturn = false) {
        if (!vehicleServerId || !driverServerId) {
            console.warn('[ServerState] startTrip: serverId mancante — corsa solo locale');
            return null;
        }
        _assertReady();
        const { data, error } = await _supabase.rpc('rpc_start_trip', {
            v_vehicle_id:      vehicleServerId,
            v_driver_id:       driverServerId,
            v_end_city:        endCity,
            v_reward:          Math.round(rewardCash),
            v_duration_ms:     Math.round(durationMs),
            v_is_empty_return: isEmptyReturn,
        });
        if (error) { _handleRpcError('rpc_start_trip', error); return null; }
        return data;   // active_trips row — store data.id as ride._serverId
    }

    // ── rpc_claim_trip_reward ─────────────────────────────────────────────────
    // Called when client detects end_time has passed (or via _autoClaimReadyTrips).
    // Returns a jsonb with { trip_id, reward_cash, end_city, km }.
    async function claimReward(tripServerId) {
        if (!tripServerId) return null;
        _assertReady();
        await _ensureCompany();
        const { data, error } = await _supabase.rpc('rpc_claim_trip_reward', {
            v_trip_id: tripServerId,
        });
        if (error) {
            // "already claimed" or "not yet done" — both non-fatal
            if (error.message?.includes('già riscosso') || error.message?.includes('non ancora')) {
                console.log('[ServerState] claimReward:', error.message);
            } else {
                _handleRpcError('rpc_claim_trip_reward', error);
            }
            return null;
        }
        if (data?.reward_cash > 0) {
            console.log(`[ServerState] ✅ Corsa riscossa: €${data.reward_cash} (${data.start_city} → ${data.end_city}, ${data.km} km)`);
        }
        return data;
    }


    // ==========================================================================
    // ALL REMAINING RPCs (Phase 4 — full eradication of client-state mutations)
    // Pattern: call RPC → if error show notification + return null, else return data.
    // The UI must NOT update after success: trust Realtime to fire and sync.
    // ==========================================================================

    // BUG 1+2 fix: guarantee the companies row exists before ANY server mutation.
    // The financial RPCs (buy/hire/invest/loan…) all require a company row; the
    // sim blob (game_saves) and the company row can drift out of sync (e.g. after
    // a DB reset, or a boot branch that loaded a sim without ensuring the row).
    // This self-heals that drift transparently so no action ever fails with
    // "azienda non trovata".
    async function _ensureCompany() {
        if (_company) return _company;
        try {
            const { data } = await _supabase.from('companies').select('*').maybeSingle();
            if (data) {
                _company = data;
                _subscribeRealtime();
                _bridgeToGameState();
                return _company;
            }
        } catch (e) { /* fall through to create */ }
        const name = (window.gameState && window.gameState.companyName)
                   || window._pendingCompanyName || 'Chauffeur Empire';
        return await initCompany(name);
    }

    async function _rpc(name, params) {
        _assertReady();
        await _ensureCompany();
        const { data, error } = await _supabase.rpc(name, params);
        if (error) { _handleRpcError(name, error); return null; }
        return data;
    }

    // ── Staff ─────────────────────────────────────────────────────────────────
    async function hireDriver(name, salary, tier = 'STANDARD') {
        return _rpc('rpc_hire_driver', { v_name: name, v_salary: salary, v_tier: tier });
    }
    async function fireDriver(driverId) {
        return _rpc('rpc_fire_driver', { v_driver_id: driverId });
    }

    // ── Investments ───────────────────────────────────────────────────────────
    async function buyInvestment(invId, price) {
        return _rpc('rpc_buy_investment', { v_inv_id: invId, v_price: Math.round(price) });
    }

    // ── Vehicle upgrades ──────────────────────────────────────────────────────
    async function buyVehicleUpgrade(vehicleId, upgradeId, price) {
        return _rpc('rpc_buy_vehicle_upgrade', {
            v_vehicle_id: vehicleId, v_upgrade_id: upgradeId, v_price: Math.round(price),
        });
    }
    async function toggleTelepass(vehicleId, cost = 0) {
        return _rpc('rpc_toggle_telepass', { v_vehicle_id: vehicleId, v_cost: Math.round(cost) });
    }

    // ── Maintenance ───────────────────────────────────────────────────────────
    async function refuelVehicle(vehicleId, fuelAmount, cost) {
        return _rpc('rpc_refuel_vehicle', {
            v_vehicle_id: vehicleId, v_fuel_amount: Math.round(fuelAmount), v_cost: Math.round(cost),
        });
    }
    async function repairVehicle(vehicleId, cost) {
        return _rpc('rpc_repair_vehicle', { v_vehicle_id: vehicleId, v_cost: Math.round(cost) });
    }

    // ── Marketing ─────────────────────────────────────────────────────────────
    async function startCampaign(campaignId, dailyCost) {
        return _rpc('rpc_start_marketing_campaign', { v_campaign_id: campaignId, v_daily_cost: dailyCost });
    }
    async function stopCampaign() {
        return _rpc('rpc_stop_marketing_campaign', {});
    }

    // ── Finance ───────────────────────────────────────────────────────────────
    async function takeLoan(principal, interestRate, dailyPayment) {
        return _rpc('rpc_take_loan', {
            v_principal: Math.round(principal),
            v_interest_rate: interestRate,
            v_daily_payment: Math.round(dailyPayment),
        });
    }
    async function repayLoan(loanId, amount) {
        return _rpc('rpc_repay_loan', { v_loan_id: loanId, v_amount: Math.round(amount) });
    }

    // ── Regions ───────────────────────────────────────────────────────────────
    async function unlockRegion(regionId, price) {
        return _rpc('rpc_unlock_region', { v_region_id: regionId, v_price: Math.round(price) });
    }

    // ── Province War + Territory System ──────────────────────────────────────
    async function acquireProvince(provinceId, offer) {
        return _rpc('rpc_acquire_province', { v_province_id: provinceId, v_offer: Math.round(offer) });
    }

    async function addProvinceInfluence(provinceId, amount) {
        return _rpc('rpc_add_province_influence', { v_province_id: provinceId, v_amount: amount || 10 });
    }

    async function getTerritorySnapshot() {
        return _rpc('rpc_get_territory_snapshot', {});
    }

    async function getMyInfluence() {
        return _rpc('rpc_get_my_influence', {});
    }

    // ── Real Estate ───────────────────────────────────────────────────────────
    async function buyRealEstate(listingId) {
        return _rpc('rpc_buy_real_estate', { v_listing_id: listingId });
    }

    // ── Fuel Market ───────────────────────────────────────────────────────────
    async function getFuelPrice() {
        _assertReady();
        const { data, error } = await _supabase
            .from('fuel_market')
            .select('price_eur')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) return null;
        return data?.price_eur ?? 1.85;
    }

    // ── Vehicle sell ──────────────────────────────────────────────────────────
    async function sellVehicle(vehicleId, price) {
        return _rpc('rpc_sell_vehicle', { v_vehicle_id: vehicleId, v_price: Math.round(price) });
    }

    // ── Tire refill (per-car) ─────────────────────────────────────────────────
    async function refillCarTires(vehicleId, cost) {
        return _rpc('rpc_refuel_vehicle', {
            v_vehicle_id:  vehicleId,
            v_fuel_amount: 0,
            v_cost:        Math.round(cost),
        });
    }

    // ── CEO Rest ──────────────────────────────────────────────────────────────
    async function restCeo(hotelStars, cost) {
        return _rpc('rpc_rest_ceo', { v_hotel_stars: hotelStars, v_cost: Math.round(cost) });
    }

    // ── Daily costs (call once per game-day tick) ──────────────────────────────
    async function collectDailyCosts() {
        return _rpc('rpc_collect_daily_costs', {});
    }

    // ── Sync authoritative cash to server after local daily tick ───────────────
    async function syncCash(cash) {
        // Aggiorna subito la baseline del delta Realtime (BUG 4) col valore che stiamo
        // per scrivere. Senza questo, quando l'echo Realtime della NOSTRA STESSA
        // scrittura torna indietro, _onCompanyChange lo confronta con un
        // _lastServerCash ancora vecchio e applica di nuovo lo stesso delta
        // (raddoppio locale, mai arrivato al server). Riprodotto dal vivo il
        // 17/08/2026: primo syncCash dopo la creazione azienda (premio login
        // Giorno 1) raddoppiava il cash locale (1000 invece di 500, server
        // corretto a 500) — l'echo dell'INSERT di initCompany() aveva lasciato
        // _lastServerCash fermo a 0 e nessun altro evento lo aveva aggiornato nel
        // frattempo.
        const v = Math.round(cash);
        _lastServerCash = v;
        return _rpc('rpc_sync_cash', { v_cash: v });
    }

    // ── Idle / Premium ────────────────────────────────────────────────────────
    async function upgradeOfflineLimit(costInCoins) {
        return _rpc('rpc_upgrade_offline_limit', { p_cost_in_coins: costInCoins });
    }
    async function buyAutoRest(costInCoins) {
        return _rpc('rpc_buy_auto_rest', { p_cost_in_coins: costInCoins });
    }
    async function buyEnergyRefill(costInCoins) {
        return _rpc('rpc_buy_energy_refill', { p_cost_in_coins: costInCoins });
    }
    async function buyFleetRepair(costInCoins) {
        return _rpc('rpc_buy_fleet_repair', { p_cost_in_coins: costInCoins });
    }
    async function buyVipContact(costInCoins) {
        return _rpc('rpc_buy_vip_contact', { p_cost_in_coins: costInCoins });
    }
    async function addDriverCoins(amount, itemId = 'sim_purchase') {
        return _rpc('rpc_add_driver_coins', { p_amount: amount, p_item_id: itemId });
    }
    // Acquisto pacchetti Executive Club: il client passa solo l'ID del pacchetto,
    // e' la RPC a decidere quanto accreditare (catalogo lato server).
    async function purchaseDriverCoinPack(packId) {
        return _rpc('rpc_purchase_dc_pack', { v_pack_id: packId });
    }
    async function spendDriverCoins(itemId, amount) {
        return _rpc('rpc_ec_spend', { p_item_id: itemId, p_amount: amount });
    }
    async function buyHRAutomation(costInCoins, days = 7) {
        return _rpc('rpc_buy_hr_automation', { v_cost_in_coins: costInCoins, v_days: days });
    }


    // ==========================================================================
    // PUBLIC GETTERS
    // ==========================================================================
    function getState()    { return { company: _company, vehicles: _vehicles, drivers: _drivers, trips: _trips }; }
    function getCompany()  { return _company; }
    function getVehicles() { return _vehicles; }
    function getDrivers()  { return _drivers; }
    function getTrips()    { return _trips; }
    function isReady()     { return _ready; }

    // Find server vehicle/driver by matching a local car/driver identifier
    function findServerVehicle(localCarId) {
        return _vehicles.find(v => v.id === localCarId || v._localId === localCarId) || null;
    }
    function findServerDriver(localDriverId) {
        return _drivers.find(d => d.id === localDriverId || d._localId === localDriverId) || null;
    }


    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    function _assertReady(mustBeReady = true) {
        if (mustBeReady && !_supabase) throw new Error('[ServerState] non inizializzato — chiama ServerState.init() dopo il login');
    }

    const _CRITICAL_RPCS = new Set([
        'rpc_claim_trip_reward', 'rpc_buy_vehicle', 'rpc_take_loan',
        'rpc_acquire_province',  'rpc_buy_real_estate',
    ]);

    function _handleRpcError(rpcName, error) {
        const msg = error?.message || error?.details || JSON.stringify(error);
        console.error(`[ServerState] RPC ${rpcName} fallita:`, msg, error);
        if (typeof showNotification === 'function') {
            const supportHint = _CRITICAL_RPCS.has(rpcName)
                ? `\nSe il problema persiste, scrivi a ${(window.GAME_CONFIG || {}).SUPPORT_EMAIL || 'support@chauffeurempire.com'}`
                : '';
            showNotification(`⚠ ${msg}${supportHint}`, 'error');
        }
    }

    // Expose public API
    return {
        init,
        initCompany,
        buyVehicle,
        startTrip,
        claimReward,
        hireDriver,
        fireDriver,
        buyInvestment,
        buyVehicleUpgrade,
        toggleTelepass,
        refuelVehicle,
        repairVehicle,
        startCampaign,
        stopCampaign,
        takeLoan,
        repayLoan,
        unlockRegion,
        acquireProvince,
        addProvinceInfluence,
        getTerritorySnapshot,
        getMyInfluence,
        buyRealEstate,
        getFuelPrice,
        sellVehicle,
        refillCarTires,
        restCeo,
        collectDailyCosts,
        syncCash,
        upgradeOfflineLimit,
        buyAutoRest,
        buyEnergyRefill,
        buyFleetRepair,
        buyVipContact,
        addDriverCoins,
        purchaseDriverCoinPack,
        spendDriverCoins,
        buyHRAutomation,
        getState,
        getCompany,
        getVehicles,
        getDrivers,
        getTrips,
        isReady,
        findServerVehicle,
        findServerDriver,
        // Internal bridge — called when gameState is available
        bridgeToGameState: _bridgeToGameState,
    };

})();

window.ServerState = ServerState;

/* ─── MIGRATION STATUS (Phase 4 complete) ────────────────────────────────────
   All RPCs implemented (SQL in 01_mmo_migration.sql + 02_mmo_rpcs_extension.sql):
     ✅ rpc_init_company          — company creation
     ✅ rpc_buy_vehicle           — fleet purchase (SELECT FOR UPDATE anti-race)
     ✅ rpc_start_trip            — trip validation + creation
     ✅ rpc_claim_trip_reward     — server-gated cash credit + position update
     ✅ rpc_hire_driver           — staff hire (deducts salary×2)
     ✅ rpc_fire_driver           — fire driver (blocks if DRIVING)
     ✅ rpc_buy_investment        — investment purchase (UNIQUE guard)
     ✅ rpc_buy_vehicle_upgrade   — per-car upgrade (array_append, IDLE check)
     ✅ rpc_toggle_telepass       — telepass on/off (cost only on enable)
     ✅ rpc_refuel_vehicle        — fuel refill
     ✅ rpc_repair_vehicle        — full condition + tire reset
     ✅ rpc_start_marketing_campaign — UPSERT active campaign
     ✅ rpc_stop_marketing_campaign  — remove active campaign
     ✅ rpc_take_loan             — add principal to cash, max 3 concurrent loans
     ✅ rpc_repay_loan            — partial/full repayment
     ✅ rpc_unlock_region         — region license purchase
     ✅ rpc_rest_ceo              — hotel rest cost deduction
     ✅ rpc_collect_daily_costs   — daily campaign + loan deductions

   Pending work — engine.js / dispatcher.js wiring:
   Each button that currently does `gameState.cash -= X` must be rewritten to:
     1. await ServerState.<method>(params)
     2. if null → error already shown, return
     3. if success → do nothing (Realtime fires → _bridgeToGameState → updateUI)
   This is a per-button refactor across ~80 action sites in engine.js + dispatcher.js.
   ─────────────────────────────────────────────────────────────────────────── */
