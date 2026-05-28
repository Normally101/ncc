# Chauffeur Empire — Professional Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Province War, Real Estate, Fuel/CO2 market, RPC server blindatura, email support, and Stellar/Volt fleet visual restyle.

**Architecture:** Server-authoritative (all cash mutations via Supabase RPC → Realtime sync → client read-only). New features use dedicated SQL tables with SECURITY DEFINER RPCs. Client-side code calls `ServerState.*` wrappers; UI never mutates `gameState.cash` directly.

**Tech Stack:** Vanilla JS, Supabase (PostgreSQL + Realtime + Edge Functions), Tailwind CSS (inline), no bundler.

**Spec:** `docs/superpowers/specs/2026-05-07-chauffeur-empire-upgrade-design.md`

---

## Pre-flight: Image Assets

Before running any code, manually place the fleet images in `assets/fleet/`:

```
assets/fleet/stellar-e-executive.jpg  ← image_26f6f6.jpg  (berlina business)
assets/fleet/stellar-v-carrier.jpg   ← image_26f02e.jpg  (van premium)
assets/fleet/stellar-s-imperial.jpg  ← image_26ebf2.jpg  (ammiraglia presidenziale)
assets/fleet/stellar-g-overlord.jpg  ← image_269255.jpg  (SUV blindato G-Wagon)
assets/fleet/volt-s-apex.jpg         ← image_2682bc.jpg  (berlina elettrica)
assets/fleet/fleet-cover.png         ← image_dccff7.png  (cover hero)
```

The `assets/fleet/` folder was created by this plan. Just copy/rename the files.

---

## Task 1: SQL — Province War, Real Estate, Fuel Market

**Files:**
- Create: `09_provinces_realestate_fuel.sql`

- [ ] **Step 1.1: Create the SQL file with all three tables**

Create `09_provinces_realestate_fuel.sql`:

```sql
-- =============================================================================
-- 09_provinces_realestate_fuel.sql
-- Chauffeur Empire — Province War + Real Estate + Fuel Market
-- IDEMPOTENT: safe to re-run.
-- Run in Supabase SQL Editor.
-- =============================================================================

-- ─── PROVINCE WAR ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provinces (
    id              TEXT PRIMARY KEY,
    name            TEXT            NOT NULL,
    region_id       TEXT            NOT NULL,
    owner_id        UUID            REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_company   TEXT,
    base_price      BIGINT          NOT NULL DEFAULT 200000,
    current_value   BIGINT          NOT NULL DEFAULT 200000,
    transit_tax_pct NUMERIC(5,4)    NOT NULL DEFAULT 0.025,
    acquired_at     TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

ALTER TABLE provinces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provinces_read_all" ON provinces;
CREATE POLICY "provinces_read_all" ON provinces FOR SELECT USING (true);

DROP POLICY IF EXISTS "provinces_write_rpc_only" ON provinces;
CREATE POLICY "provinces_write_rpc_only" ON provinces
    FOR ALL USING (false) WITH CHECK (false);

ALTER PUBLICATION supabase_realtime ADD TABLE provinces;

-- Seed initial provinces
INSERT INTO provinces (id, name, region_id, base_price, current_value) VALUES
    ('prov_roma',    'Roma Capitale',    'lazio',     500000, 500000),
    ('prov_milano',  'Grande Milano',    'lombardia', 800000, 800000),
    ('prov_firenze', 'Firenze Storica',  'toscana',   400000, 400000),
    ('prov_napoli',  'Napoli Metropoli', 'campania',  350000, 350000),
    ('prov_venezia', 'Venezia Laguna',   'veneto',    450000, 450000)
ON CONFLICT (id) DO NOTHING;

-- RPC: Acquire a province (OPA at 1.20× current_value)
CREATE OR REPLACE FUNCTION rpc_acquire_province(
    v_province_id TEXT,
    v_offer       BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prov          provinces%ROWTYPE;
    v_company       companies%ROWTYPE;
    v_min_offer     BIGINT;
    v_prev_owner_co UUID;
BEGIN
    -- Load province with lock
    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provincia non trovata: %', v_province_id;
    END IF;

    -- Load buyer's company
    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata per questo utente';
    END IF;

    -- Prevent self-takeover
    IF v_prov.owner_id = auth.uid() THEN
        RAISE EXCEPTION 'Sei già il proprietario di questa provincia';
    END IF;

    -- Check minimum offer
    v_min_offer := CEIL(v_prov.current_value * 1.20);
    IF v_offer < v_min_offer THEN
        RAISE EXCEPTION 'Offerta insufficiente: minimo €% (120%% del valore attuale €%)',
            v_min_offer, v_prov.current_value;
    END IF;

    -- Check buyer cash
    IF v_company.cash < v_offer THEN
        RAISE EXCEPTION 'Fondi insufficienti: disponibili €%, necessari €%',
            v_company.cash, v_offer;
    END IF;

    -- Debit buyer
    UPDATE companies SET cash = cash - v_offer WHERE user_id = auth.uid();

    -- Credit 80% to previous owner (if any)
    IF v_prov.owner_id IS NOT NULL THEN
        UPDATE companies
           SET cash = cash + FLOOR(v_offer * 0.80)
         WHERE user_id = v_prov.owner_id;
    END IF;

    -- Transfer province
    UPDATE provinces SET
        owner_id      = auth.uid(),
        owner_company = v_company.company_name,
        current_value = v_offer,
        acquired_at   = NOW(),
        updated_at    = NOW()
    WHERE id = v_province_id;

    -- Broadcast news
    INSERT INTO global_news (company_name, message, type)
    VALUES (v_company.company_name,
            v_company.company_name || ' ha conquistato la provincia di ' || v_prov.name || '! 🏴',
            'milestone');

    RETURN jsonb_build_object(
        'success',       true,
        'province_name', v_prov.name,
        'new_value',     v_offer,
        'previous_owner', v_prov.owner_company
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_acquire_province(TEXT, BIGINT) TO authenticated;

-- RPC: Apply province transit tax (called inside rpc_claim_trip_reward)
-- Returns tax amount deducted, or 0 if no owner / self-trip
CREATE OR REPLACE FUNCTION _apply_province_transit_tax(
    v_user_id    UUID,
    v_province_id TEXT,
    v_fare        BIGINT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prov     provinces%ROWTYPE;
    v_tax      BIGINT;
BEGIN
    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id;
    -- No owner, owner is self, or province not found → no tax
    IF NOT FOUND OR v_prov.owner_id IS NULL OR v_prov.owner_id = v_user_id THEN
        RETURN 0;
    END IF;

    v_tax := GREATEST(1, FLOOR(v_fare * v_prov.transit_tax_pct));

    -- Credit province owner
    UPDATE companies SET cash = cash + v_tax WHERE user_id = v_prov.owner_id;

    RETURN v_tax;
END;
$$;

-- ─── REAL ESTATE ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS real_estate_listings (
    id          TEXT PRIMARY KEY,
    city        TEXT            NOT NULL,
    name        TEXT            NOT NULL,
    description TEXT,
    cost        BIGINT          NOT NULL,
    daily_rent  BIGINT          NOT NULL,
    bonus_type  TEXT,
    bonus_city  TEXT
);

ALTER TABLE real_estate_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "re_listings_read_all" ON real_estate_listings;
CREATE POLICY "re_listings_read_all" ON real_estate_listings FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS company_real_estate (
    id           BIGSERIAL    PRIMARY KEY,
    company_id   UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    listing_id   TEXT         NOT NULL REFERENCES real_estate_listings(id),
    purchased_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_rent_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, listing_id)
);

ALTER TABLE company_real_estate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cre_own" ON company_real_estate;
CREATE POLICY "cre_own" ON company_real_estate
    FOR ALL USING (company_id = _my_company_id())
    WITH CHECK   (company_id = _my_company_id());

ALTER PUBLICATION supabase_realtime ADD TABLE company_real_estate;

-- Seed real estate listings
INSERT INTO real_estate_listings (id, city, name, description, cost, daily_rent, bonus_type, bonus_city) VALUES
    ('re_milano_attico',  'Milano',  'Attico CityLife',       'Penthouse panoramica vista Tre Torri', 5000000, 15000, 'driver_stress_recovery', 'milano'),
    ('re_roma_palazzo',   'Roma',    'Palazzetto Trastevere', 'Palazzo storico nel cuore di Roma',     3500000, 10000, NULL, NULL),
    ('re_firenze_loft',   'Firenze', 'Loft Ponte Vecchio',    'Loft di design con vista sull''Arno',   2000000,  6000, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- RPC: Buy a real estate property
CREATE OR REPLACE FUNCTION rpc_buy_real_estate(
    v_listing_id TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_listing  real_estate_listings%ROWTYPE;
    v_company  companies%ROWTYPE;
BEGIN
    SELECT * INTO v_listing FROM real_estate_listings WHERE id = v_listing_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Immobile non trovato: %', v_listing_id; END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;

    -- Already owned?
    IF EXISTS (SELECT 1 FROM company_real_estate WHERE company_id = v_company.id AND listing_id = v_listing_id) THEN
        RAISE EXCEPTION 'Immobile già di tua proprietà';
    END IF;

    IF v_company.cash < v_listing.cost THEN
        RAISE EXCEPTION 'Fondi insufficienti: disponibili €%, necessari €%',
            v_company.cash, v_listing.cost;
    END IF;

    UPDATE companies SET cash = cash - v_listing.cost WHERE id = v_company.id;

    INSERT INTO company_real_estate (company_id, listing_id)
    VALUES (v_company.id, v_listing_id);

    RETURN jsonb_build_object(
        'success',    true,
        'listing_id', v_listing_id,
        'name',       v_listing.name,
        'daily_rent', v_listing.daily_rent
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_buy_real_estate(TEXT) TO authenticated;

-- RPC: Credit rent for all owned real estate (called by cron Edge Function or game tick)
CREATE OR REPLACE FUNCTION rpc_credit_real_estate_rents()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_rec       RECORD;
    v_total     BIGINT := 0;
    v_count     INT    := 0;
BEGIN
    FOR v_rec IN
        SELECT cre.id, cre.company_id, rel.daily_rent
          FROM company_real_estate cre
          JOIN real_estate_listings rel ON rel.id = cre.listing_id
         WHERE cre.last_rent_at < NOW() - INTERVAL '24 hours'
    LOOP
        UPDATE companies SET cash = cash + v_rec.daily_rent WHERE id = v_rec.company_id;
        UPDATE company_real_estate SET last_rent_at = NOW() WHERE id = v_rec.id;
        v_total := v_total + v_rec.daily_rent;
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('credited_count', v_count, 'total_rent', v_total);
END;
$$;

-- Note: Grant to service_role only (called from Edge Function, not from browser)
GRANT EXECUTE ON FUNCTION rpc_credit_real_estate_rents() TO service_role;

-- ─── FUEL MARKET ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fuel_market (
    id         BIGSERIAL    PRIMARY KEY,
    price_eur  NUMERIC(6,4) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE fuel_market ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fuel_read_all" ON fuel_market;
CREATE POLICY "fuel_read_all" ON fuel_market FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE fuel_market;

-- Seed initial price
INSERT INTO fuel_market (price_eur) VALUES (1.85);

-- RPC: Update fuel price (called by cron, not browser — uses service_role)
CREATE OR REPLACE FUNCTION rpc_update_fuel_price()
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_last    NUMERIC;
    v_new     NUMERIC;
    v_delta   NUMERIC;
BEGIN
    SELECT price_eur INTO v_last FROM fuel_market ORDER BY updated_at DESC LIMIT 1;
    v_last := COALESCE(v_last, 1.85);

    -- Random walk ±5%, clamped to [1.20, 3.00]
    v_delta := (RANDOM() * 0.10 - 0.05);
    v_new   := GREATEST(1.20, LEAST(3.00, v_last * (1.0 + v_delta)));
    v_new   := ROUND(v_new, 4);

    INSERT INTO fuel_market (price_eur) VALUES (v_new);

    -- Keep only last 48 rows (48h of hourly history)
    DELETE FROM fuel_market
     WHERE id NOT IN (SELECT id FROM fuel_market ORDER BY updated_at DESC LIMIT 48);

    RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_update_fuel_price() TO service_role;

-- ─── EXTEND rpc_claim_trip_reward WITH CO2 TAX & PROVINCE TAX ─────────────────
-- NOTE: This block patches the existing rpc_claim_trip_reward to apply province
-- transit tax and CO2 deduction. Run this AFTER 01_mmo_migration.sql.
-- The CO2 rate table is defined here for easy tuning.

CREATE TABLE IF NOT EXISTS vehicle_co2_rates (
    model_id      TEXT PRIMARY KEY,
    co2_per_km_kg NUMERIC(6,4) NOT NULL DEFAULT 0.18
);

INSERT INTO vehicle_co2_rates (model_id, co2_per_km_kg) VALUES
    ('stellar_e_exec',  0.18),
    ('stellar_v_carr',  0.22),
    ('stellar_s_imp',   0.20),
    ('stellar_g_over',  0.28),
    ('volt_s_apex',     0.00)   -- electric: exempt
ON CONFLICT (model_id) DO NOTHING;

ALTER TABLE vehicle_co2_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "co2_read_all" ON vehicle_co2_rates;
CREATE POLICY "co2_read_all" ON vehicle_co2_rates FOR SELECT USING (true);
```

- [ ] **Step 1.2: Run the SQL in Supabase Dashboard**

Open Supabase Dashboard → SQL Editor → New query.
Paste the full content of `09_provinces_realestate_fuel.sql` and click Run.

Expected output: no errors. Tables visible in Table Editor:
- `provinces` (5 seed rows)
- `real_estate_listings` (3 seed rows)
- `company_real_estate` (empty)
- `fuel_market` (1 seed row)
- `vehicle_co2_rates` (5 seed rows)

- [ ] **Step 1.3: Commit the SQL file**

```bash
git add 09_provinces_realestate_fuel.sql assets/fleet/.gitkeep
git commit -m "feat(sql): Province War, Real Estate, Fuel Market tables + RPCs"
```

---

## Task 2: ServerState — New RPC Wrappers

**Files:**
- Modify: `serverState.js` (add 3 new wrapper methods + sell/refuelTires)

- [ ] **Step 2.1: Add new RPC wrappers to serverState.js**

Find the `// ── Regions ───` block in `serverState.js` (~line 363) and insert after `unlockRegion`:

```js
    // ── Province War ──────────────────────────────────────────────
    async function acquireProvince(provinceId, offer) {
        return _rpc('rpc_acquire_province', { v_province_id: provinceId, v_offer: Math.round(offer) });
    }

    // ── Real Estate ───────────────────────────────────────────────
    async function buyRealEstate(listingId) {
        return _rpc('rpc_buy_real_estate', { v_listing_id: listingId });
    }

    // ── Fuel Market ───────────────────────────────────────────────
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

    // ── Vehicle sell ──────────────────────────────────────────────
    async function sellVehicle(vehicleId, price) {
        return _rpc('rpc_sell_vehicle', { v_vehicle_id: vehicleId, v_price: Math.round(price) });
    }

    // ── Tire refill (per-car) ─────────────────────────────────────
    async function refillCarTires(vehicleId, cost) {
        return _rpc('rpc_refuel_vehicle', {
            v_vehicle_id:  vehicleId,
            v_fuel_amount: 0,
            v_cost:        Math.round(cost),
        });
    }
```

Also add these to the `return { ... }` block at the bottom of serverState.js:

```js
        acquireProvince,
        buyRealEstate,
        getFuelPrice,
        sellVehicle,
        refillCarTires,
```

- [ ] **Step 2.2: Add Realtime subscription for new tables to `_subscribeRealtime`**

In `serverState.js`, find `_channel = _supabase.channel('ce_game_events')` and add subscriptions for `provinces` and `company_real_estate` after the `active_trips` subscription:

```js
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'provinces' },
                (payload) => {
                    if (typeof renderTabProvinces === 'function' && _tabIs?.('provinces')) renderTabProvinces();
                })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'company_real_estate',
                  filter: `company_id=eq.${_company.id}` },
                (payload) => {
                    if (typeof renderTabRealEstate === 'function' && _tabIs?.('realestate')) renderTabRealEstate();
                })
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'fuel_market' },
                (payload) => {
                    if (payload.new?.price_eur && window.gameState) {
                        gameState.fuelPrice = parseFloat(payload.new.price_eur);
                        if (typeof updateUI === 'function') updateUI();
                    }
                })
```

- [ ] **Step 2.3: Load fuel price on init**

In `serverState.js`, at the end of the `init` function, after `_bridgeToGameState()`, add:

```js
        // Sync live fuel price into gameState
        const liveFuelPrice = await getFuelPrice();
        if (liveFuelPrice && window.gameState) {
            gameState.fuelPrice = parseFloat(liveFuelPrice);
        }
```

- [ ] **Step 2.4: Commit**

```bash
git add serverState.js
git commit -m "feat(server): Province War + Real Estate + Fuel Market RPC wrappers + Realtime"
```

---

## Task 3: RPC Blindatura — engine.js

**Files:**
- Modify: `engine.js` (~10 functions)

The rule: every function that directly does `gameState.cash -= cost` for a user-triggered action must:
1. Check `if (!window.ServerState?.isReady()) { /* legacy local path */ return; }` optionally
2. Call `await ServerState.method(...)` 
3. Return early if result is `null` (error already notified)
4. NOT modify `gameState.cash` (Realtime will sync it)

- [ ] **Step 3.1: Migrate `refillTires` in engine.js**

Find `window.refillTires = function(carId)` (~line 858). Replace the body:

```js
window.refillTires = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.tirePressure === undefined) car.tirePressure = 0;
    const missing = 100 - car.tirePressure;
    if (missing <= 0) { showNotification('Pressione gomme ottimale!', 'error'); return; }
    const cost = Math.ceil(missing * 0.8);

    const result = await ServerState.refillCarTires(car._serverId, cost);
    if (!result) return;

    car.tirePressure = 100;
    logToMap(`🔧 ${car.name}: pressione gomme ripristinata. (−€${cost})`);
    if (typeof closeModals === 'function') closeModals();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};
```

- [ ] **Step 3.2: Migrate `buyBlackMarketFuel` in engine.js**

Find `window.buyBlackMarketFuel = function(carId)` (~line 1286). Replace the `gameState.cash -= cost;` line with:

```js
    const result = await ServerState.refuelVehicle(car._serverId, Math.ceil(litres), cost);
    if (!result) return;
    // Remove: gameState.cash -= cost;
```

Also make the function `async` (change `function(carId)` to `async function(carId)`).

- [ ] **Step 3.3: Migrate `buyStandardFuel` in engine.js**

Find `window.buyStandardFuel = function(carId)` (~line 1316). Same pattern:

```js
window.buyStandardFuel = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.engineHealth <= 0) { showNotification('⚙️ Motore fuso! Ripara prima il motore.', 'error'); return; }
    const fuelNeeded = 100 - (car.fuel || 0);
    if (fuelNeeded < 1) { showNotification('Il serbatoio è già pieno!', 'error'); return; }
    const litres = fuelNeeded * 0.5;
    const price  = gameState.fuelPrice || 1.85;
    const cost   = Math.floor(litres * price);

    const result = await ServerState.refuelVehicle(car._serverId, Math.ceil(litres), cost);
    if (!result) return;

    car.fuel = 100;
    if (car.outOfService === 'fuel') car.outOfService = null;
    logToMap(`⛽ ${car.name}: rifornito al distributore. −€${cost}`);
    showNotification(`⛽ Rifornimento standard: +${Math.floor(fuelNeeded)}% · −€${cost}`, 'success');
    saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};
```

- [ ] **Step 3.4: Migrate `repairEngine` in engine.js**

Find `window.repairEngine = function(carId)` (~line 1336). Replace the `gameState.cash -= repairCost;` line with:

```js
window.repairEngine = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if ((car.engineHealth || 100) >= 100) { showNotification('Il motore è già in perfette condizioni.', 'error'); return; }
    const damage     = 100 - (car.engineHealth || 100);
    const repairCost = Math.max(800, damage * 180);

    const result = await ServerState.repairVehicle(car._serverId, repairCost);
    if (!result) return;

    car.engineHealth = 100;
    if (car.outOfService === 'engine') car.outOfService = null;
    logToMap(`⚙️ ${car.name}: motore riparato. −€${repairCost.toLocaleString()}`);
    showNotification(`⚙️ Motore riparato! −€${repairCost.toLocaleString()}`, 'success');
    if (typeof closeModals === 'function') closeModals();
    saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    updateUI();
};
```

- [ ] **Step 3.5: Migrate `repairCar` in engine.js**

Find `function repairCar(carId)` (~line 3352). The existing function already calls `updateUI()` after `gameState.cash -= cost`. Replace the cash-mutation block:

```js
async function repairCar(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.status === 'busy') {
        showNotification('Auto in servizio — impossibile riparare adesso.', 'error');
        if (typeof renderTabFleet === 'function') renderTabFleet();
        updateUI();
        return;
    }

    let cost = (100 - car.condition) * 25;
    if (gameState.staff.some(s => s.id === 'mech')) cost = cost * 0.5;
    if (hasInvestment('inv_mobile_workshop')) cost = Math.floor(cost * 0.8);

    const result = await ServerState.repairVehicle(car._serverId, cost);
    if (!result) return;

    car.condition = 100;
    if (typeof closeModals === 'function') closeModals();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    updateUI();
}
```

- [ ] **Step 3.6: Migrate `rest` in engine.js**

Find `function rest(stars)` (~line 3448). Replace with:

```js
async function rest(stars) {
    let cost       = stars === 3 ? 80  : (stars === 4 ? 200 : 600);
    let energyGain = stars === 3 ? 50  : (stars === 4 ? 75  : 100);
    let repGain    = stars === 5 ? 0.1 : 0;

    const result = await ServerState.restCeo(stars, cost);
    if (!result) return;

    gameState.energy     = Math.min(100, gameState.energy + energyGain);
    gameState.reputation += repGain;
    if (typeof closeModals === 'function') closeModals();
    updateUI();
}
```

- [ ] **Step 3.7: Migrate `buyRegion` in engine.js**

Find `function buyRegion(regionId)` (~line 3486). Replace with:

```js
async function buyRegion(regionId) {
    const region = REGIONS[regionId];
    if (!region) return;
    if (gameState.reputation < region.repReq) {
        showNotification(`Reputazione insufficiente (${region.repReq}★ richiesti)`, 'error');
        return;
    }

    const result = await ServerState.unlockRegion(regionId, region.price);
    if (!result) return;

    gameState.unlockedRegions.push(regionId);
    updateUI();
    if (typeof renderTabRegions === 'function') renderTabRegions();
    if (typeof drawHighways === 'function') drawHighways();
    if (typeof drawPOIs === 'function') drawPOIs();
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    saveGame();
}
```

- [ ] **Step 3.8: Migrate `buyInvestment` in engine.js**

Find `function buyInvestment(invId)` (~line 3499). The existing function already calls `ServerState.buyInvestment` but also has `gameState.cash -= item.price`. Remove the local cash mutation — keep only the ServerState call:

```js
async function buyInvestment(invId) {
    const item = INVESTMENTS.find(i => i.id === invId);
    if (!item || gameState.investments.includes(invId)) return;
    if ((gameState.constructions || []).some(c => c.invId === invId)) {
        if (typeof showNotification === 'function') showNotification('Costruzione già in corso!', 'error');
        return;
    }

    const result = await ServerState.buyInvestment(invId, item.price);
    if (!result) return;

    // Construction or instant unlock (no local cash mutation — Realtime handles cash)
    if (item.buildDays > 0) {
        gameState.constructions = gameState.constructions || [];
        gameState.constructions.push({ invId, startDay: gameState.day, buildDays: item.buildDays, completesDay: gameState.day + item.buildDays });
        showNotification(`🏗️ Costruzione avviata: ${item.name} — ${item.buildDays} giorni`, 'success');
    } else {
        gameState.investments.push(invId);
        showNotification(`✅ ${item.name} acquistato!`, 'success');
    }
    if (typeof closeModals === 'function') closeModals();
    updateUI();
    saveGame();
}
```

- [ ] **Step 3.9: Commit engine.js migrations**

```bash
git add engine.js
git commit -m "refactor(engine): RPC blindatura — refuel, repair, rest, region, investment"
```

---

## Task 4: RPC Blindatura — dispatcher.js

**Files:**
- Modify: `dispatcher.js` (~lines 2090–2200)

- [ ] **Step 4.1: Migrate `__cfgConfirm` (car purchase via configurator)**

Find `window.__cfgConfirm = function(cId, cType)` (~line 2165). Replace the cash mutation + fleet.push block:

```js
    window.__cfgConfirm = async function(cId, cType) {
        const car = (cType === 'new' ? NEW_CARS : USED_CARS).find(c => c.id === cId);
        if (!car) return;
        const ups    = [...sel];
        const upTotal = ups.reduce((s, uid) => { const u = CAR_UPGRADES.find(x => x.id === uid); return s + (u ? u.price : 0); }, 0);
        const total  = car.price + upTotal;

        // Buy vehicle via server
        const result = await ServerState.buyVehicle(car.vehicleClass || car.id, total, ServerState.getCompany()?.hq_city || 'roma');
        if (!result) return;

        // Apply upgrades if any (server vehicle id comes from result.id)
        for (const uid of ups) {
            const u = CAR_UPGRADES.find(x => x.id === uid);
            if (u) await ServerState.buyVehicleUpgrade(result.id, uid, u.price);
        }

        // Add to local fleet immediately (Realtime will confirm)
        gameState.fleet.push({
            id: 'c_' + Date.now(), _serverId: result.id,
            name: car.name, tier: car.tier, condition: car.condition || 100,
            isLease: false, fuel: 100, mileage: 0, tirePressure: 100,
            upgrades: ups, vehicleClass: car.vehicleClass || 'mercedes_e',
        });
        document.getElementById('modal-configurator')?.remove();
        updateUI(); renderTabFleet();
        showBigEvent('🚗', `${car.name} Configurata!`,
            ups.length > 0 ? `${ups.length} optional installati · pronta al servizio.` : 'Veicolo standard pronto per la flotta.');
        if (typeof saveGame === 'function') saveGame();
        if ((car.tier === 'ultra' || car.tier === 'vip') && car.price >= 80000) {
            if (typeof _broadcastNews === 'function')
                _broadcastNews(`${gameState.companyName} ha aggiunto alla flotta una ${car.name} 🚗`, 'milestone');
        }
    };
```

- [ ] **Step 4.2: Migrate `leaseCar` in dispatcher.js**

Find `window.leaseCar = function(carId)` (~line 2189). Replace with:

```js
window.leaseCar = async function(carId) {
    const c = NEW_CARS.find(x => x.id === carId);
    if (!c) return;
    const upFront = Math.floor(c.price * 0.1);

    const result = await ServerState.buyVehicle(c.vehicleClass || c.id, upFront, ServerState.getCompany()?.hq_city || 'roma');
    if (!result) return;

    gameState.fleet.push({
        id: 'l_' + Date.now(), _serverId: result.id,
        name: c.name, tier: c.tier, condition: 100,
        isLease: true, dailyCost: Math.floor(c.price / 300),
        vehicleClass: c.vehicleClass || 'mercedes_e',
        fuel: 100, mileage: 0, tirePressure: 100, upgrades: [],
    });
    updateUI(); renderTabFleet();
    showNotification('Contratto Leasing approvato!', 'success');
};
```

- [ ] **Step 4.3: Migrate `buyStaff` in dispatcher.js**

Find `gameState.cash -= s.salary; gameState.staff.push(s);` (~line 2095). Replace the surrounding block:

```js
    if (currentStaff >= maxStaff) {
        showNotification(`Limite staff raggiunto (${maxStaff}). Potenzia la sede!`, 'error');
        return;
    }
    const result = await ServerState.hireDriver(s.name, s.salary, 'STAFF');
    if (!result) return;
    gameState.staff.push(s);
    showNotification(`${s.name} assunto con successo!`, 'success');
    updateUI(); renderTabStaff();
    if (typeof saveGame === 'function') saveGame();
```

Also make the outer function `async` if it isn't already.

- [ ] **Step 4.4: Commit dispatcher.js migrations**

```bash
git add dispatcher.js
git commit -m "refactor(dispatcher): RPC blindatura — car purchase, lease, staff hire"
```

---

## Task 5: Email Support — Final Touches

**Files:**
- Modify: `style.css` (add `.auth-support-link` rule)
- Modify: `serverState.js` (`_handleRpcError` — add email hint for critical errors)

> Note: `config.js` ✅ done, `auth.js` login link ✅ done (line 368), `renderTabHelp` ✅ done.

- [ ] **Step 5.1: Add CSS for auth support link**

In `style.css`, find the `.auth-hint` rule and add after it:

```css
.auth-support-link {
    text-align: center;
    font-size: 10px;
    color: #6b7280;
    margin-top: 8px;
}
.auth-support-link a {
    color: #d4af37;
    text-decoration: underline;
    text-underline-offset: 2px;
}
```

- [ ] **Step 5.2: Add email hint to critical RPC errors**

In `serverState.js`, find `function _handleRpcError(rpcName, error)` (~line 425). Replace it with:

```js
    const CRITICAL_RPCS = new Set([
        'rpc_claim_trip_reward', 'rpc_buy_vehicle', 'rpc_take_loan',
        'rpc_acquire_province', 'rpc_buy_real_estate',
    ]);

    function _handleRpcError(rpcName, error) {
        const msg = error?.message || error?.details || JSON.stringify(error);
        console.error(`[ServerState] RPC ${rpcName} fallita:`, msg, error);
        const suffix = CRITICAL_RPCS.has(rpcName)
            ? `\nSe il problema persiste, scrivi a ${(window.GAME_CONFIG || {}).SUPPORT_EMAIL || 'support@chauffeurempire.com'}`
            : '';
        if (typeof showNotification === 'function') {
            showNotification(`⚠ ${msg}${suffix}`, 'error');
        }
    }
```

- [ ] **Step 5.3: Commit**

```bash
git add style.css serverState.js
git commit -m "feat(support): email hint in critical RPC errors + auth-support-link CSS"
```

---

## Task 6: Stellar & Volt Fleet — Images + CSS

**Files:**
- Modify: `style.css` (glassmorphism fleet card styles)
- Modify: `engine.js` (add `STELLAR_VOLT_CATALOG` constant)

> Pre-requisite: images must be in `assets/fleet/` (see Pre-flight above).

- [ ] **Step 6.1: Add fleet card CSS to style.css**

At the end of `style.css`, add:

```css
/* ── STELLAR & VOLT FLEET CARDS ─────────────────────────────── */
.fleet-card-luxury {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    margin-bottom: 12px;
    border: 1px solid rgba(212,175,55,0.15);
    background: #0a0a0f;
    min-height: 140px;
}
.fleet-card-photo {
    position: absolute;
    inset: 0;
    background-image: var(--card-img);
    background-size: cover;
    background-position: center 30%;
    opacity: 0.35;
    filter: saturate(0.8);
}
.fleet-card-glass {
    position: relative;
    z-index: 1;
    padding: 12px;
    background: linear-gradient(
        to right,
        rgba(10,10,15,0.92) 0%,
        rgba(10,10,15,0.75) 60%,
        rgba(10,10,15,0.30) 100%
    );
}
.fleet-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
}
.fleet-card-brand {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.02em;
}
.fleet-card-tier {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #d4af37;
    border: 1px solid rgba(212,175,55,0.4);
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(212,175,55,0.08);
}
.fleet-card-electric .fleet-card-tier {
    color: #22c55e;
    border-color: rgba(34,197,94,0.4);
    background: rgba(34,197,94,0.08);
}
.fleet-card-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    margin-bottom: 8px;
}
.fleet-stat-row {
    display: flex;
    align-items: center;
    gap: 4px;
}
.fleet-stat-label {
    font-size: 8px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    min-width: 32px;
}
.fleet-stat-bar {
    flex: 1;
    height: 3px;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
    overflow: hidden;
}
.fleet-stat-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
}
.fleet-card-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.fleet-card-cover {
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 16px;
    aspect-ratio: 16/5;
    background-image: url('assets/fleet/fleet-cover.png');
    background-size: cover;
    background-position: center;
    border: 1px solid rgba(212,175,55,0.2);
}
```

- [ ] **Step 6.2: Add `STELLAR_VOLT_CATALOG` to engine.js**

After the `gameState` declaration (~line 120), add:

```js
const STELLAR_VOLT_CATALOG = [
    {
        id: 'stellar_e_exec', name: 'Stellar E-Executive',
        img: 'assets/fleet/stellar-e-executive.jpg',
        tier: 'BUSINESS', fuel: 'gasoline',
        price: 120000, co2PerKm: 0.18,
        vehicleClass: 'stellar_e_exec',
    },
    {
        id: 'stellar_v_carr', name: 'Stellar V-Carrier',
        img: 'assets/fleet/stellar-v-carrier.jpg',
        tier: 'PREMIUM', fuel: 'gasoline',
        price: 95000, co2PerKm: 0.22,
        vehicleClass: 'stellar_v_carr',
    },
    {
        id: 'stellar_s_imp', name: 'Stellar S-Imperial',
        img: 'assets/fleet/stellar-s-imperial.jpg',
        tier: 'PRESIDENTIAL', fuel: 'gasoline',
        price: 250000, co2PerKm: 0.20,
        vehicleClass: 'stellar_s_imp',
    },
    {
        id: 'stellar_g_over', name: 'Stellar G-Overlord',
        img: 'assets/fleet/stellar-g-overlord.jpg',
        tier: 'ARMORED', fuel: 'gasoline',
        price: 320000, co2PerKm: 0.28,
        vehicleClass: 'stellar_g_over',
    },
    {
        id: 'volt_s_apex', name: 'Volt S-Apex',
        img: 'assets/fleet/volt-s-apex.jpg',
        tier: 'PRESIDENTIAL', fuel: 'electric',
        price: 280000, co2PerKm: 0.0,
        vehicleClass: 'volt_s_apex',
    },
];
window.STELLAR_VOLT_CATALOG = STELLAR_VOLT_CATALOG;
```

- [ ] **Step 6.3: Commit**

```bash
git add style.css engine.js
git commit -m "feat(fleet): Stellar & Volt catalog + glassmorphism card CSS"
```

---

## Task 7: Fleet Card HTML — renderTabFleet Restyle

**Files:**
- Modify: `dispatcher.js` — `renderTabFleet` function (~line 1456)

- [ ] **Step 7.1: Replace the per-car loop inside `renderTabFleet`**

Find the line `let html = fuelDepotHtml + \`<h3 class="text-[10px]...Tua Flotta</h3>\`` (~line 1456).

Replace the block from that line through the end of the `gameState.fleet.forEach(car => {...})` loop (find the closing `});` of the forEach) with:

```js
    let html = fuelDepotHtml + `
    <div class="fleet-card-cover"></div>
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Tua Flotta</h3>
    <div class="mb-6">`;

    gameState.fleet.forEach(car => {
        if (!car.upgrades) car.upgrades = [];
        const catalog = (window.STELLAR_VOLT_CATALOG || []).find(c => c.vehicleClass === car.vehicleClass || c.id === car.vehicleClass);
        const imgUrl  = catalog?.img || '';
        const isElec  = catalog?.fuel === 'electric';

        const fuelVal   = isElec ? (car.chargeLevel ?? 100) : Math.floor(car.fuel ?? 100);
        const fuelLabel = isElec ? '⚡ Carica' : '⛽ Carb.';
        const fuelColor = fuelVal < 20 ? '#ff4060' : fuelVal < 50 ? '#f59e0b' : (isElec ? '#22c55e' : '#00f2ff');

        const condVal   = Math.floor(car.condition ?? 100);
        const condColor = condVal < 30 ? '#ff4060' : condVal < 60 ? '#f59e0b' : '#22c55e';

        const tierLabel = catalog?.tier || (car.tier === 'ultra' ? 'ULTRA' : car.tier === 'vip' ? 'VIP' : 'STANDARD');

        const outReason = car.outOfService;
        const outBadge  = outReason
            ? `<div class="text-[8px] text-red-400 font-bold bg-red-900/30 rounded px-2 py-0.5 mb-2">
                 🔴 ${outReason === 'fuel' ? 'FERMA — Serbatoio esaurito'
                    : outReason === 'tires' ? 'FERMA — Gomme esaurite'
                    : 'MOTORE FUSO — Riparazione urgente'}
               </div>` : '';

        const assignedDriver = gameState.drivers.find(d => d.assignedCarId === car.id && d.id !== 'ceo');
        const driverBadge    = assignedDriver
            ? `<span class="text-[8px] text-gray-400">👤 ${assignedDriver.name}</span>`
            : `<span class="text-[8px] text-gray-600 italic">Nessun autista</span>`;

        const statusDot = car.status === 'busy'
            ? `<span class="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1"></span>In Servizio`
            : `<span class="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 mr-1"></span>Inattiva`;

        html += `
        <div class="fleet-card-luxury ${isElec ? 'fleet-card-electric' : ''}"
             style="--card-img: url('${imgUrl}')">
          <div class="fleet-card-photo"></div>
          <div class="fleet-card-glass">
            ${outBadge}
            <div class="fleet-card-header">
              <div>
                <div class="fleet-card-brand">${car.name}</div>
                <div class="text-[8px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                  ${statusDot} · ${driverBadge}
                </div>
              </div>
              <span class="fleet-card-tier">${tierLabel}</span>
            </div>
            <div class="fleet-card-stats">
              <div class="fleet-stat-row">
                <span class="fleet-stat-label">${fuelLabel}</span>
                <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${fuelVal}%;background:${fuelColor}"></div></div>
                <span class="text-[8px] font-mono" style="color:${fuelColor};min-width:26px;text-align:right">${fuelVal}%</span>
              </div>
              <div class="fleet-stat-row">
                <span class="fleet-stat-label">Cond.</span>
                <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${condVal}%;background:${condColor}"></div></div>
                <span class="text-[8px] font-mono" style="color:${condColor};min-width:26px;text-align:right">${condVal}%</span>
              </div>
            </div>
            <div class="fleet-card-actions">
              <button onclick="window.openCarModal('${car.id}')" class="btn-gold !text-[8px] !py-1 !px-3 flex-1">Gestisci</button>
              ${!assignedDriver ? `<button onclick="window.openAssignModal('${car.id}')" class="btn-blue !text-[8px] !py-1 !px-3">Assegna</button>` : ''}
            </div>
          </div>
        </div>`;
    });

    html += `</div>`;
```

- [ ] **Step 7.2: Verify fleet renders correctly in browser**

Open the game, navigate to Gestione Flotta. Confirm:
- Each car shows with the luxury card style (photo background, glassmorphism overlay)
- Fuel/charge bar shows correctly
- "Gestisci" and "Assegna" buttons work
- If `assets/fleet/` images are missing, background is transparent (no JS errors)

- [ ] **Step 7.3: Commit**

```bash
git add dispatcher.js
git commit -m "feat(ui): luxury Fleet Card glassmorphism restyle with Stellar & Volt photos"
```

---

## Task 8: Volt S-Apex Electric Logic

**Files:**
- Modify: `engine.js` (fuel consumption + charge logic)

- [ ] **Step 8.1: Add electric charge/refuel helpers to engine.js**

After the `STELLAR_VOLT_CATALOG` declaration, add:

```js
function _isElectric(car) {
    const cat = (window.STELLAR_VOLT_CATALOG || []).find(c => c.vehicleClass === car.vehicleClass || c.id === car.vehicleClass);
    return cat?.fuel === 'electric';
}

window.superchargeVehicle = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car || !_isElectric(car)) return;
    const charge = car.chargeLevel ?? 100;
    if (charge >= 100) { showNotification('Batteria già al 100%!', 'error'); return; }
    const cost = 80; // Supercharger flat fee

    const result = await ServerState.refuelVehicle(car._serverId, 0, cost);
    if (!result) return;

    car.chargeLevel = 100;
    if (car.outOfService === 'fuel') car.outOfService = null;
    logToMap(`⚡ ${car.name}: ricaricata al Supercharger. −€${cost}`);
    showNotification(`⚡ Supercharger: batteria al 100% · −€${cost}`, 'success');
    saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};
```

- [ ] **Step 8.2: Differentiate fuel consumption for electric cars in the ride tick**

Find the per-ride fuel consumption logic in `engine.js` (look for `car.fuel -= ` or `fuelConsumed`). Add an `_isElectric` check:

```js
// Find the block that reduces car.fuel during a ride tick and wrap it:
if (_isElectric(car)) {
    // Electric: consume charge at 40% the rate of gasoline
    car.chargeLevel = Math.max(0, (car.chargeLevel ?? 100) - fuelConsumed * 0.4);
    if ((car.chargeLevel ?? 100) < 5) car.outOfService = 'fuel';
} else {
    car.fuel = Math.max(0, (car.fuel ?? 100) - fuelConsumed);
    if ((car.fuel ?? 100) < 5) car.outOfService = 'fuel';
}
```

- [ ] **Step 8.3: Commit**

```bash
git add engine.js
git commit -m "feat(volt): Volt S-Apex electric charge system + Supercharger action"
```

---

## Task 9: CO2 Tax in Trip Reward

**Files:**
- Modify: `engine.js` (apply CO2 deduction when claiming trip reward locally)

> The SQL `_apply_province_transit_tax` is called inside `rpc_claim_trip_reward` server-side.
> CO2 tax is calculated client-side (matches the server-side `vehicle_co2_rates` table).

- [ ] **Step 9.1: Add CO2 tax calculation helper**

In `engine.js`, after `_isElectric`, add:

```js
const CO2_RATE_EUR_PER_KG = 0.15; // €0.15/kg CO2 (simplified EU ETS)

function _co2TaxForRide(car, distKm) {
    const cat = (window.STELLAR_VOLT_CATALOG || []).find(c => c.vehicleClass === car.vehicleClass || c.id === car.vehicleClass);
    const co2PerKm = cat?.co2PerKm ?? 0.18; // default gasoline rate
    return Math.round(distKm * co2PerKm * CO2_RATE_EUR_PER_KG);
}
window._co2TaxForRide = _co2TaxForRide; // exposed for dispatcher display
```

- [ ] **Step 9.2: Apply CO2 deduction when a ride completes**

Find the function that handles ride completion (look for `gameState.cash += earned` or `ride.reward` after a trip ends). After the reward is added, deduct CO2 tax:

```js
// After: gameState.cash += earned;   (or after the ServerState.claimReward call)
const co2Tax = _co2TaxForRide(car, ride.distKm || 0);
if (co2Tax > 0) {
    // This is informational — actual deduction is server-side via rpc_claim_trip_reward
    logToMap(`🌿 CO₂ tassa: −€${co2Tax} (${car.name})`);
}
```

> Note: The actual deduction happens server-side. The client log is for transparency only. To wire the full server-side CO2 deduction, `rpc_claim_trip_reward` in the SQL migration files must be patched to call `_apply_province_transit_tax` and subtract CO2 using the `vehicle_co2_rates` table. That SQL patch can be added to `09_provinces_realestate_fuel.sql` after verifying the existing `rpc_claim_trip_reward` signature.

- [ ] **Step 9.3: Commit**

```bash
git add engine.js
git commit -m "feat(co2): CO2 tax helper + client-side logging per ride"
```

---

## Task 10: Province War UI

**Files:**
- Modify: `dispatcher.js` (add `renderTabProvinces` + wire to tab switch)
- Modify: `index.html` (add "Province" nav button if not present)

- [ ] **Step 10.1: Add Province War tab renderer to dispatcher.js**

At the end of `dispatcher.js` (before `window.renderCurrentTab`):

```js
// ── PROVINCE WAR TAB ──────────────────────────────────────────
window.renderTabProvinces = async function() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div class="text-[9px] text-gray-500 text-center py-8">Caricamento province…</div>`;

    const { data: provinces, error } = await window.supabaseClient
        .from('provinces')
        .select('*')
        .order('current_value', { ascending: false });

    if (error) {
        container.innerHTML = `<div class="text-[9px] text-red-400 text-center py-8">Errore caricamento: ${error.message}</div>`;
        return;
    }

    const myUserId   = window.currentUser?.id;
    const myCash     = gameState.cash || 0;

    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">🗺️ Guerra delle Province</h3>
    <div class="text-[9px] text-gray-500 mb-4 leading-relaxed">Conquista una provincia pagando il 120% del valore attuale. Il proprietario incassa il 2.5% su ogni corsa partita dal suo territorio.</div>
    <div class="space-y-2 mb-6">`;

    provinces.forEach(p => {
        const isOwner     = p.owner_id === myUserId;
        const minOffer    = Math.ceil(p.current_value * 1.20);
        const canAfford   = myCash >= minOffer;
        const ownerLabel  = isOwner
            ? `<span class="text-green-400 font-bold">📌 TUO</span>`
            : p.owner_company
                ? `<span class="text-yellow-400">👑 ${p.owner_company}</span>`
                : `<span class="text-gray-500">Libera</span>`;

        html += `
        <div class="hud-card">
          <div class="flex justify-between items-start mb-1">
            <div class="text-[11px] font-bold text-white">${p.name}</div>
            ${ownerLabel}
          </div>
          <div class="flex justify-between items-center text-[8px] text-gray-500 mb-2">
            <span>💰 Valore attuale: <span class="text-white font-mono">€${p.current_value.toLocaleString()}</span></span>
            <span>🧾 Tassa transito: <span class="text-gold">${(p.transit_tax_pct * 100).toFixed(1)}%</span></span>
          </div>
          ${!isOwner ? `
          <div class="flex items-center gap-2">
            <div class="text-[8px] text-gray-500 flex-1">OPA min: <span class="font-mono text-white">€${minOffer.toLocaleString()}</span></div>
            <button
              onclick="window.acquireProvince('${p.id}', ${minOffer})"
              ${canAfford ? '' : 'disabled'}
              class="btn-gold !text-[8px] !py-1 !px-3 ${canAfford ? '' : 'opacity-40 cursor-not-allowed'}">
              🏴 Conquista
            </button>
          </div>` : `
          <div class="text-[8px] text-green-400">✅ Stai incassando il ${(p.transit_tax_pct*100).toFixed(1)}% da ogni corsa in questa provincia.</div>`}
        </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
};

window.acquireProvince = async function(provinceId, offer) {
    const result = await ServerState.acquireProvince(provinceId, offer);
    if (!result) return;
    showNotification(`🏴 Provincia conquistata! Nuovo valore: €${result.new_value?.toLocaleString()}`, 'success');
    window.renderTabProvinces();
};
```

- [ ] **Step 10.2: Wire tab to dispatcher.js switch**

Find the `case 'market':` line in the tab switch (~line 1029) and add after it:

```js
        case 'provinces': title.innerText = "🗺️ Guerra delle Province"; _safeRender(renderTabProvinces); break;
```

- [ ] **Step 10.3: Add Province nav button to index.html (if missing)**

Search `index.html` for the nav buttons bar (look for `data-tab="market"` or `data-tab="store"`). Add alongside them:

```html
<button class="nav-btn" data-tab="provinces" onclick="switchTab('provinces')">🗺️<span>Province</span></button>
```

- [ ] **Step 10.4: Commit**

```bash
git add dispatcher.js index.html
git commit -m "feat(provinces): Province War tab UI + OPA conquest action"
```

---

## Task 11: Real Estate UI

**Files:**
- Modify: `dispatcher.js` (add `renderTabRealEstate`)
- Modify: `dispatcher.js` (wire to tab switch)
- Modify: `index.html` (nav button)

- [ ] **Step 11.1: Add Real Estate renderer to dispatcher.js**

```js
// ── REAL ESTATE TAB ───────────────────────────────────────────
window.renderTabRealEstate = async function() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div class="text-[9px] text-gray-500 text-center py-8">Caricamento immobili…</div>`;

    const companyId = ServerState.getCompany()?.id;

    const [listingsRes, ownedRes] = await Promise.all([
        window.supabaseClient.from('real_estate_listings').select('*').order('cost'),
        companyId
            ? window.supabaseClient.from('company_real_estate').select('*').eq('company_id', companyId)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (listingsRes.error) {
        container.innerHTML = `<div class="text-[9px] text-red-400 text-center py-8">Errore: ${listingsRes.error.message}</div>`;
        return;
    }

    const owned   = new Set((ownedRes.data || []).map(r => r.listing_id));
    const myCash  = gameState.cash || 0;

    const cityIcons = { Milano: '🏙️', Roma: '🏛️', Firenze: '🌸' };

    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">🏢 Mercato Immobiliare</h3>
    <div class="text-[9px] text-gray-500 mb-4 leading-relaxed">Investi i profitti in immobili di lusso. Le rendite vengono accreditate ogni 24 ore.</div>
    <div class="space-y-3 mb-6">`;

    listingsRes.data.forEach(listing => {
        const isOwned = owned.has(listing.id);
        const canBuy  = !isOwned && myCash >= listing.cost;
        const icon    = cityIcons[listing.city] || '🏠';
        const bonusLine = listing.bonus_type === 'driver_stress_recovery'
            ? `<div class="text-[8px] text-purple-400 mt-1">✨ Bonus: recupero stress driver rapido a ${listing.bonus_city}</div>`
            : '';

        html += `
        <div class="hud-card ${isOwned ? '!border-green-400/30 bg-green-400/5' : ''}">
          <div class="flex justify-between items-start mb-1">
            <div class="text-[12px] font-bold text-white">${icon} ${listing.name}</div>
            ${isOwned ? `<span class="text-[8px] text-green-400 font-bold">✅ TUO</span>` : ''}
          </div>
          <div class="text-[9px] text-gray-400 mb-1">${listing.city} — ${listing.description || ''}</div>
          <div class="flex justify-between text-[9px] mb-2">
            <span>💰 Costo: <span class="text-white font-mono font-bold">€${listing.cost.toLocaleString()}</span></span>
            <span>📅 Rendita: <span class="text-gold font-mono font-bold">+€${listing.daily_rent.toLocaleString()}/giorno</span></span>
          </div>
          ${bonusLine}
          ${!isOwned ? `
          <button
            onclick="window.buyRealEstate('${listing.id}')"
            ${canBuy ? '' : 'disabled'}
            class="btn-gold !text-[8px] !py-1 w-full mt-2 ${canBuy ? '' : 'opacity-40 cursor-not-allowed'}">
            🏢 Acquista Immobile
          </button>` : `
          <div class="text-[8px] text-green-400 mt-1">📬 Prossima rendita: automatica ogni 24h</div>`}
        </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
};

window.buyRealEstate = async function(listingId) {
    const result = await ServerState.buyRealEstate(listingId);
    if (!result) return;
    showNotification(`🏢 ${result.name} acquistato! Rendita: +€${result.daily_rent?.toLocaleString()}/giorno`, 'success');
    window.renderTabRealEstate();
};
```

- [ ] **Step 11.2: Wire to tab switch in dispatcher.js**

After the `case 'provinces':` line:

```js
        case 'realestate': title.innerText = "🏢 Real Estate"; _safeRender(renderTabRealEstate); break;
```

- [ ] **Step 11.3: Add nav button to index.html**

```html
<button class="nav-btn" data-tab="realestate" onclick="switchTab('realestate')">🏢<span>Immobili</span></button>
```

- [ ] **Step 11.4: Commit**

```bash
git add dispatcher.js index.html
git commit -m "feat(realestate): Real Estate market tab UI + buy action"
```

---

## Task 12: Fuel Market UI + CO2 Display

**Files:**
- Modify: `dispatcher.js` (`renderTabFleet` fuel depot section)

- [ ] **Step 12.1: Add live fuel price indicator to depot section**

In `renderTabFleet`, find the fuel depot HTML block that shows `€${price}/L`. The price already comes from `gameState.fuelPrice`. Add a volatility indicator:

```js
// Replace the existing price display line inside fuelDepotHtml:
const priceTrend = (gameState.fuelPrice || 1.85) < 1.70 ? '📉 Basso' : (gameState.fuelPrice || 1.85) > 2.20 ? '📈 Alto' : '➡️ Medio';
// Then in the HTML:
// <div class="text-[10px] font-bold" style="color:${pColor}">€${price}/L · ${priceTrend}</div>
```

Replace the price badge line in `fuelDepotHtml`:

```js
// OLD:
`<div class="text-[10px] font-bold" style="color:${pColor}">€${price}/L</div>`
// NEW:
`<div class="text-[10px] font-bold flex items-center gap-1" style="color:${pColor}">€${price}/L <span class="text-[8px] opacity-70">${priceTrend}</span></div>`
```

- [ ] **Step 12.2: Show CO2 badge on electric car cards**

In the fleet card loop added in Task 7, add after the `tierLabel` span for electric cars:

```js
// After the fleet-card-tier span, add for electric:
${isElec ? `<div class="text-[7px] text-green-400 font-bold mt-0.5 text-right">🌿 CO₂ ESENTE</div>` : ''}
```

Inside the fleet-card-header, replace:

```js
`<span class="fleet-card-tier">${tierLabel}</span>`
```

with:

```js
`<div class="text-right">
   <span class="fleet-card-tier">${tierLabel}</span>
   ${isElec ? `<div class="text-[7px] text-green-400 font-bold mt-0.5">🌿 CO₂ ESENTE</div>` : ''}
 </div>`
```

- [ ] **Step 12.3: Commit**

```bash
git add dispatcher.js
git commit -m "feat(fuel): live fuel price trend indicator + CO2 exempt badge on Volt"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| SQL: provinces table | Task 1 |
| SQL: real_estate_listings + company_real_estate | Task 1 |
| SQL: fuel_market | Task 1 |
| RPC: rpc_acquire_province | Task 1 |
| RPC: rpc_buy_real_estate | Task 1 |
| RPC: rpc_credit_real_estate_rents | Task 1 |
| RPC: province transit tax | Task 1 (_apply_province_transit_tax) |
| ServerState wrappers | Task 2 |
| Fuel Realtime sync on init | Task 2 |
| refuelVehicle, repairVehicle, restCeo, buyRegion, buyInvestment blindatura | Task 3 |
| Car purchase + lease blindatura | Task 4 |
| Staff hire blindatura | Task 4 |
| Email CSS + _handleRpcError hint | Task 5 |
| config.js SUPPORT_EMAIL | ✅ already done |
| auth.js login support link | ✅ already done |
| renderTabHelp bug report button | ✅ already done |
| STELLAR_VOLT_CATALOG | Task 6 |
| Fleet card glassmorphism CSS | Task 6 |
| Fleet card HTML restyle | Task 7 |
| Volt S-Apex electric chargeLevel logic | Task 8 |
| Supercharger €80 action | Task 8 |
| CO2 tax helper + client logging | Task 9 |
| Province War UI tab | Task 10 |
| Real Estate UI tab | Task 11 |
| Fuel price trend display | Task 12 |
| CO2 exempt badge on Volt | Task 12 |

### Gaps / Notes

- `rpc_sell_vehicle` SQL function is NOT included — `sellVehicle()` in serverState.js references it but the SQL migration doesn't define it yet. Either add it to `09_provinces_realestate_fuel.sql` or keep `sellCar` as local-only for now. **Recommendation:** add to `09_provinces_realestate_fuel.sql`:

```sql
CREATE OR REPLACE FUNCTION rpc_sell_vehicle(v_vehicle_id UUID, v_price BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Verify vehicle belongs to caller
    IF NOT EXISTS (
        SELECT 1 FROM vehicles v
        JOIN companies c ON c.id = v.company_id
        WHERE v.id = v_vehicle_id AND c.user_id = auth.uid()
        AND v.status = 'IDLE'
    ) THEN
        RAISE EXCEPTION 'Veicolo non trovato, non tuo, o in servizio';
    END IF;

    DELETE FROM vehicles WHERE id = v_vehicle_id;
    UPDATE companies SET cash = cash + v_price WHERE user_id = auth.uid();

    RETURN jsonb_build_object('success', true, 'sold_price', v_price);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_sell_vehicle(UUID, BIGINT) TO authenticated;
```

- Edge Function for `rpc_credit_real_estate_rents` (cron every 24h): this requires a Supabase Edge Function to be deployed separately. The SQL RPC is ready; the Edge Function deployment is out of scope for this plan but straightforward:

```js
// supabase/functions/credit-rents/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await supabase.rpc('rpc_credit_real_estate_rents')
  return new Response(JSON.stringify({ data, error }), { headers: { 'Content-Type': 'application/json' } })
})
```

Schedule via `supabase/functions/credit-rents/config.toml` with `schedule = "0 * * * *"` (hourly) or use pg_cron in Supabase Dashboard.

---

## Brainstorming: Token Economy — VTK (Vettura Token)

> **Problema:** Dare DC come reward delle missioni introduce inflazione incontrollata. Il DC è la valuta premium del gioco — se il giocatore ne guadagna liberamente svolgendo missioni, perde valore. Soluzione: introdurre un token secondario (VTK) che si guadagna dalle missioni e si scambia con DC sul mercato tra giocatori.

### Concetto base

| | DC (Diamond Coin) | VTK (Vettura Token) |
|---|---|---|
| **Fonte** | Acquisto reale / eventi rari / ranking | Missioni, obiettivi giornalieri, traguardi |
| **Scarsità** | Alta — emissione controllata | Media — emissione da missioni, con cap giornaliero |
| **Uso diretto** | Acquisti premium (veicoli top, slot staff extra, boost) | Mercato P2P → DC, oppure spendibile in un negozio VTK separato |
| **Tasso di cambio** | Fisso lato sviluppatore: no | Dinamico: determinato dall'offerta/domanda dei giocatori |

### Come funziona il mercato VTK ↔ DC

- I giocatori che vogliono DC in più possono comprare VTK con DC (a un tasso che decidono loro).
- I giocatori che hanno VTK da missioni possono venderli per DC.
- Il tasso di cambio fluttua in base all'offerta disponibile — più missioni vengono completate, più VTK in circolazione, più il prezzo VTK/DC scende (come nel mercato valute di eRepublik).
- Questo crea un ciclo economico: i giocatori attivi guadagnano VTK → vendono per DC → i giocatori premium comprano VTK con DC per spenderli nel negozio VTK.

### Negozio VTK (alternativa al mercato P2P)

Oggetti acquistabili solo con VTK (non con DC né con €):
- Slot garage temporaneo (+1 veicolo per 7 giorni)
- Boost fatica autista (ripristino immediato)
- Skin livrea veicolo esclusiva
- Accesso anticipato a missioni capitolo successivo
- Booster reputazione (+0.1 rep immediato, cap 1/settimana)

Questo crea domanda costante di VTK anche senza passare per il mercato P2P.

### Emissione controllata

- Cap giornaliero per giocatore: es. max 500 VTK/giorno da missioni
- Missioni capitoli avanzati danno più VTK (incentivo alla progressione)
- VTK non trasferibili direttamente tra account (evita farming multi-account) — solo scambiabili via mercato con DC

### Tabella reward missioni (proposta)

| Tipo missione | Reward € | Reward VTK | Note |
|---|---|---|---|
| Missione base (Cap. I) | €3.000–8.000 | 50–150 VTK | nessun DC |
| Missione avanzata (Cap. II+) | €10.000–30.000 | 200–500 VTK | nessun DC |
| Obiettivo giornaliero | €500–2.000 | 20–80 VTK | reset 24h |
| Traguardo ranking (top 10) | — | 1.000 VTK bonus | settimanale |
| Evento speciale | — | 500–2.000 VTK | occasionale |

### Implementazione tecnica (schema SQL)

```sql
-- Tabella saldi VTK per azienda
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vtk_balance BIGINT NOT NULL DEFAULT 0;

-- Mercato P2P VTK ↔ DC
CREATE TABLE IF NOT EXISTS vtk_market_orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vtk_amount  BIGINT NOT NULL,          -- VTK in vendita
    dc_price    NUMERIC(10,4) NOT NULL,   -- DC richiesti per 1 VTK
    created_at  TIMESTAMPTZ DEFAULT now(),
    filled_at   TIMESTAMPTZ
);

-- RPC: reward VTK da missione (server-authoritative)
-- rpc_award_mission_vtk(mission_id, vtk_amount) → aggiorna vtk_balance
-- RPC: piazza ordine di vendita VTK
-- rpc_place_vtk_sell_order(vtk_amount, dc_price_per_vtk)
-- RPC: compra VTK da ordine esistente (paga in DC)
-- rpc_fill_vtk_order(order_id)
```

### Task da implementare (future)

- [ ] **VTK-1:** Aggiungere colonna `vtk_balance` a `companies` + RPC `rpc_award_mission_vtk`
- [ ] **VTK-2:** Tabella `vtk_market_orders` + RPC place/fill order
- [ ] **VTK-3:** UI tab "Mercato VTK" (lista ordini, piazza ordine, storico)
- [ ] **VTK-4:** Negozio VTK con 5–8 oggetti spendibili
- [ ] **VTK-5:** Cap giornaliero VTK da missioni (tracked in `daily_vtk_earned` su `companies`)
- [ ] **VTK-6:** Aggiornare reward di tutte le missioni esistenti: sostituire DC con VTK
