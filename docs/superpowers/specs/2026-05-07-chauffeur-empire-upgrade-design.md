# Chauffeur Empire — Professional Upgrade Design
**Date:** 2026-05-07  
**Status:** APPROVED  
**Scope:** 6 tasks across SQL, RPC migration, email support, visual restyle, Province War, Real Estate, Fuel/CO2

---

## Context

The game is live at chauffeurempire.com, connected to Supabase.  
`serverState.js` already has all RPC wrapper functions implemented.  
`config.js` already has `SUPPORT_EMAIL: 'support@chauffeurempire.com'`.  
The remaining work is: new SQL tables/RPCs, wiring client-side mutations to server RPCs, UI integrations, and visual restyle.

---

## Task 1 — RPC Blindatura (Client → Server Authoritative)

### Architecture
Strict server-authoritative: no optimistic local updates.

```
button click → await ServerState.method()
             → null: error already shown by _handleRpcError, return
             → ok: do nothing — Realtime fires → _bridgeToGameState → updateUI()
```

### Scope
~80 mutation sites across `engine.js` and `dispatcher.js` where `gameState.cash -= X` or direct fleet mutations must become `await ServerState.method()`.

### Pattern
```js
// BEFORE
gameState.cash -= cost;
updateUI();

// AFTER
const result = await ServerState.refuelVehicle(car._serverId, fuelAmt, cost);
if (!result) return;
// Realtime handles UI update automatically
```

### Affected functions (representative)
- `buyFuelForDepot`, `buyTiresForDepot`, `upgradeFuelDepot`
- `repairCar`, `refuelCar`
- `hireDriver`, `fireDriver`
- `buyVehicle`, `buyVehicleUpgrade`, `toggleTelepass`
- `buyInvestment`, `takeLoan`, `repayLoan`
- `startCampaign`, `stopCampaign`
- `unlockRegion`, `restCeo`
- All dispatcher.js action handlers matching `case 'buy_*'`, `case 'hire_*'`, etc.

---

## Task 2 — Email Corporate Support

`config.js` already contains `SUPPORT_EMAIL`. Three integration points:

### 2a — auth.js login form
Add below the submit button:
```html
<p class="text-center text-[10px] text-gray-500 mt-3">
  Problemi di accesso? 
  <a href="mailto:support@chauffeurempire.com?subject=Problema%20di%20Accesso" 
     class="text-gold underline">Contatta il supporto</a>
</p>
```

### 2b — dispatcher.js settings tab
New "Aiuto & Supporto" section with "Segnala un Bug" button:
```js
const subject = encodeURIComponent(`Segnalazione Bug - ID Compagnia: ${ServerState.getCompany()?.id}`);
`<a href="mailto:support@chauffeurempire.com?subject=${subject}">Segnala un Bug</a>`
```

### 2c — serverState.js `_handleRpcError`
Append to error notification:
```
"Se il problema persiste, scrivi a support@chauffeurempire.com"
```
Only for critical RPCs (trip claim, vehicle purchase, loan).

---

## Task 3 — Visual Restyle: Stellar & Volt Collection

### New vehicle catalog
```js
const STELLAR_VOLT_CATALOG = [
  { id: 'stellar_e_exec',  name: 'Stellar E-Executive', img: 'assets/fleet/stellar-e-executive.jpg',  tier: 'BUSINESS',     fuel: 'gasoline', price: 120000, co2_per_km: 0.18 },
  { id: 'stellar_v_carr',  name: 'Stellar V-Carrier',   img: 'assets/fleet/stellar-v-carrier.jpg',    tier: 'PREMIUM',      fuel: 'gasoline', price:  95000, co2_per_km: 0.22 },
  { id: 'stellar_s_imp',   name: 'Stellar S-Imperial',  img: 'assets/fleet/stellar-s-imperial.jpg',   tier: 'PRESIDENTIAL', fuel: 'gasoline', price: 250000, co2_per_km: 0.20 },
  { id: 'stellar_g_over',  name: 'Stellar G-Overlord',  img: 'assets/fleet/stellar-g-overlord.jpg',   tier: 'ARMORED',      fuel: 'gasoline', price: 320000, co2_per_km: 0.28 },
  { id: 'volt_s_apex',     name: 'Volt S-Apex',         img: 'assets/fleet/volt-s-apex.jpg',          tier: 'PRESIDENTIAL', fuel: 'electric', price: 280000, co2_per_km: 0.0  },
];
```

### Fleet Card HTML (glassmorphism)
Each card in `renderTabFleet`:
```html
<div class="fleet-card-luxury" style="--card-img: url('assets/fleet/stellar-e-executive.jpg')">
  <div class="fleet-card-photo"></div>
  <div class="fleet-card-glass">
    <div class="fleet-card-header">
      <span class="fleet-card-brand">Stellar E-Executive</span>
      <span class="fleet-card-tier">BUSINESS</span>
    </div>
    <div class="fleet-card-stats"><!-- fuel/condition bars --></div>
    <div class="fleet-card-actions"><!-- buttons --></div>
  </div>
</div>
```

### Volt S-Apex electric logic
- Uses `chargeLevel` (0–100%) instead of `fuel`
- Charge rate: +1%/min (vs gasoline +5%/min)  
- Supercharger cost: €80 flat for full charge
- `co2_tax_per_km = 0` → exempt from all CO2 fees
- No `fuelTank` consumption
- UI: shows ⚡ charge bar instead of fuel bar

### Image file mapping
```
assets/fleet/stellar-e-executive.jpg  ← image_26f6f6.jpg  (berlina business)
assets/fleet/stellar-v-carrier.jpg   ← image_26f02e.jpg  (van premium)
assets/fleet/stellar-s-imperial.jpg  ← image_26ebf2.jpg  (ammiraglia presidenziale)
assets/fleet/stellar-g-overlord.jpg  ← image_269255.jpg  (SUV blindato)
assets/fleet/volt-s-apex.jpg         ← image_2682bc.jpg  (elettrica)
assets/fleet/fleet-cover.png         ← image_dccff7.png  (cover flotta)
```

---

## Task 4 — SQL: Province War

### Table: `provinces`
```sql
CREATE TABLE provinces (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  region_id       TEXT NOT NULL,
  owner_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_company   TEXT,
  base_price      BIGINT NOT NULL DEFAULT 200000,
  current_value   BIGINT NOT NULL DEFAULT 200000,
  transit_tax_pct NUMERIC(5,4) NOT NULL DEFAULT 0.025,
  acquired_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### RPC: `rpc_acquire_province`
- Input: `v_province_id TEXT, v_offer BIGINT`
- Validation: `offer >= current_value * 1.20`
- On success:
  - Credits `offer * 0.80` to previous owner (if any)
  - Sets new `owner_id`, `owner_company`, `current_value = offer`, `acquired_at`
  - Broadcasts news via `rpc_broadcast_news`
- Returns: `{ success, province_name, new_value }`

### RPC: `rpc_province_transit_tax`
- Called from `rpc_claim_trip_reward` when trip origin matches a province
- Deducts `fare * transit_tax_pct` from rider's reward
- Credits same amount to province owner's company cash
- Returns: `{ tax_amount, owner_company }`

### Province seed (initial 5 provinces)
```sql
INSERT INTO provinces (id, name, region_id, base_price, current_value) VALUES
  ('prov_roma',     'Roma Capitale',    'lazio',     500000, 500000),
  ('prov_milano',   'Grande Milano',    'lombardia', 800000, 800000),
  ('prov_firenze',  'Firenze Storica',  'toscana',   400000, 400000),
  ('prov_napoli',   'Napoli Metropoli', 'campania',  350000, 350000),
  ('prov_venezia',  'Venezia Laguna',   'veneto',    450000, 450000);
```

---

## Task 5 — SQL: Real Estate

### Table: `real_estate_listings`
```sql
CREATE TABLE real_estate_listings (
  id          TEXT PRIMARY KEY,
  city        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  cost        BIGINT NOT NULL,
  daily_rent  BIGINT NOT NULL,
  bonus_type  TEXT,
  bonus_city  TEXT
);
```

### Table: `company_real_estate`
```sql
CREATE TABLE company_real_estate (
  id           BIGSERIAL PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  listing_id   TEXT NOT NULL REFERENCES real_estate_listings(id),
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  last_rent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, listing_id)
);
```

### RPC: `rpc_buy_real_estate`
- Deducts cost from company cash
- Inserts into `company_real_estate`
- Returns purchased listing row

### RPC: `rpc_credit_real_estate_rents`
- Called by cron Edge Function every 24h
- For each `company_real_estate` where `last_rent_at < now() - interval '24h'`:
  - Credits `daily_rent` to company cash
  - Updates `last_rent_at`
- Idempotent (safe to retry)

### Seed
```sql
INSERT INTO real_estate_listings VALUES
  ('re_milano_attico',  'Milano',  'Attico CityLife',       'Penthouse panoramica', 5000000, 15000, 'driver_stress_recovery', 'milano'),
  ('re_roma_palazzo',   'Roma',    'Palazzetto Trastevere', 'Palazzo storico',       3500000, 10000, null, null),
  ('re_firenze_loft',   'Firenze', 'Loft Ponte Vecchio',    'Loft di lusso',         2000000,  6000, null, null);
```

---

## Task 6 — Fuel Market & CO2

### Table: `fuel_market`
```sql
CREATE TABLE fuel_market (
  id         BIGSERIAL PRIMARY KEY,
  price_eur  NUMERIC(6,4) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Edge Function: `update-fuel-price` (cron every hour)
```js
const lastPrice = /* fetch latest from fuel_market */;
const variation = (Math.random() * 0.10 - 0.05);  // ±5%
const newPrice = Math.max(1.20, Math.min(3.00, lastPrice * (1 + variation)));
// INSERT into fuel_market
```

### Client fuel sync
- `ServerState` loads current fuel price on init from `fuel_market`
- Subscribed via Realtime — `gameState.fuelPrice` updates automatically

### CO2 tax logic (applied in `rpc_claim_trip_reward`)
```
co2_tax = km * co2_per_km_vehicle * CO2_RATE_EUR_PER_KG
CO2_RATE = 0.15  -- €0.15/kg CO2 (simplified EU ETS)
Volt S-Apex: co2_per_km = 0 → always exempt
```

CO2 tax deducted from trip reward (not added as extra cost) — creates meaningful EV advantage.

---

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | SQL: tables + seed + RPCs | `09_provinces_realestate_fuel.sql` |
| 2 | RPC blindatura engine.js | `engine.js` |
| 3 | RPC blindatura dispatcher.js | `dispatcher.js` |
| 4 | Email support integration | `auth.js`, `dispatcher.js`, `serverState.js` |
| 5 | Save fleet images to `assets/fleet/` | `assets/fleet/*.jpg` |
| 6 | Fleet card glassmorphism CSS | `style.css` |
| 7 | Fleet card HTML + vehicle catalog | `dispatcher.js`, `engine.js` |
| 8 | Volt S-Apex electric logic | `engine.js`, `dispatcher.js` |
| 9 | Province War JS + RPC wiring | `dispatcher.js` |
| 10 | Real Estate JS + RPC wiring | `dispatcher.js` |
| 11 | Fuel market JS + CO2 tax | `engine.js`, `dispatcher.js` |

---

## Constraints & Non-Goals

- No backwards-compatibility shims for old vehicle model IDs (new fleet is additive)
- CO2 tax is deducted from reward (not a separate UI charge) — keeps economy balanced
- Province transit tax is capped: owner cannot tax themselves
- Real Estate bonus `driver_stress_recovery` is passive — no extra UI, applies in existing stress tick
- Fuel price fluctuates on server only — client reads via Realtime subscription
