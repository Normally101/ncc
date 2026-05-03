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
            .subscribe((status) => {
                console.log('[ServerState] Realtime:', status);
            });
    }

    // ── Realtime handlers ──────────────────────────────────────────────────────
    function _onCompanyChange(payload) {
        const { eventType, new: newRow } = payload;
        if (eventType === 'UPDATE' || eventType === 'INSERT') {
            _company = newRow;
            _bridgeToGameState();
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
    function _bridgeToGameState() {
        if (!window.gameState || !_company) return;

        // Authoritative financial fields — always trust the server
        gameState.cash         = _company.cash;
        gameState.titanCoins   = _company.titan_coins ?? gameState.titanCoins ?? 0;
        gameState.reputation   = parseFloat(_company.reputation) || gameState.reputation;
        gameState.companyName  = _company.company_name || gameState.companyName;
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

    function _handleRpcError(rpcName, error) {
        const msg = error?.message || error?.details || JSON.stringify(error);
        console.error(`[ServerState] RPC ${rpcName} fallita:`, msg, error);
        if (typeof showNotification === 'function') {
            showNotification(`⚠ ${msg}`, 'error');
        }
    }

    // Expose public API
    return {
        init,
        initCompany,
        buyVehicle,
        startTrip,
        claimReward,
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

/* ─── MIGRATION STATUS ────────────────────────────────────────────────────────
   Actions currently going through server RPCs:
     ✅ Company init  (rpc_init_company)
     ✅ Buy vehicle   (rpc_buy_vehicle)     — replaces local fleet.push + cash deduction
     ✅ Start trip    (rpc_start_trip)      — validates and records on server
     ✅ Claim reward  (rpc_claim_trip_reward) — authoritative cash credit

   Actions still using local gameState mutation (pending additional RPCs):
     ⏳ Hire driver, fire driver
     ⏳ Buy investment (inv_*)
     ⏳ Upgrade vehicle (CAR_UPGRADES)
     ⏳ Marketing campaigns
     ⏳ Take / repay loan
     ⏳ Unlock region
     ⏳ Purchase fuel / tires / repairs
   These will each require a new SECURITY DEFINER RPC + gameState bridge update.
   ─────────────────────────────────────────────────────────────────────────── */
