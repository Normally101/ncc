-- ================================================================
-- 51_lockdown_driver_coins_negative_cost_scaffold.sql
-- Chauffeur Empire · Hardening: costo negativo su 6 RPC Driver Coins
-- ⚠️  STATO REALE VERIFICATO SUL DB DI PRODUZIONE IL 28/08/2026
--     (interrogando pg_proc/pg_get_functiondef, non fidandosi di questa
--     intestazione): **QUESTO FILE È STATO APPLICATO.** L'avviso qui sotto
--     era rimasto dalla stesura e diceva il falso — leggerlo faceva credere
--     aperta una falla già chiusa, o spingeva a riapplicare inutilmente.
--     Verificato: tutte e 6 le RPC Driver Coins validano il segno del costo.
-- (storico) SCAFFOLD — NON applicato al DB di produzione da questa sessione.
-- Verificato leggendo il codice reale prima di scrivere questo file:
-- 05_mmo_driver_coins.sql (5 RPC) + 12_hr_automation.sql (1 RPC).
-- ================================================================
--
-- BUG confermato (stessa classe già chiusa in `49_lockdown_critical_
-- cash_rpcs_scaffold.sql` per cash/vehicle/loan, mai estesa a Driver
-- Coins): ognuna delle 6 RPC sotto valida solo `driver_coins < costo`
-- (fondi insufficienti) ma non valida mai il SEGNO del costo passato
-- dal client. Chiamando una qualsiasi con un costo NEGATIVO:
--
--   v_company.driver_coins < p_cost_in_coins   -- es. 100 < -50000 → FALSE, check superato
--   ...
--   driver_coins = driver_coins - p_cost_in_coins  -- 100 - (-50000) = 50100
--
-- il saldo Driver Coins AUMENTA invece di scalare — conio arbitrario
-- di valuta premium, chiamabile oggi con la sola anon key/JWT
-- autenticato, nessun controllo lato client rilevante (è comunque
-- bypassabile da devtools). In più, ogni RPC applica GRATIS anche il
-- suo effetto collaterale (energia CEO al 100%, Auto-Rest attivo,
-- +2h limite offline, riparazione flotta, contatto VIP garantito,
-- buff HR Automation esteso).
--
-- Il pattern corretto esiste già nel codebase (`rpc_ec_spend` in
-- `17_executive_club.sql:66-68`, `IF p_amount <= 0 THEN RAISE
-- EXCEPTION`) — qui si applica lo stesso guard, prima di qualsiasi
-- lettura/scrittura, alle 6 RPC che ne erano prive.
--
-- Nessuna altra modifica di comportamento: firma, logica di business
-- ed effetti collaterali di ogni RPC restano identici al legittimo.
-- IDEMPOTENTE: CREATE OR REPLACE, sicuro da ri-eseguire.
-- ================================================================

-- ── 1. rpc_upgrade_offline_limit ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_upgrade_offline_limit(
    p_cost_in_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
BEGIN
    IF p_cost_in_coins <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'costo non valido');
    END IF;

    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    IF v_company.offline_limit_hours >= 12 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'limite massimo già raggiunto (12h)');
    END IF;

    UPDATE companies
    SET
        driver_coins         = driver_coins - p_cost_in_coins,
        offline_limit_hours  = LEAST(12, offline_limit_hours + 2)
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',                   true,
        'offline_limit_hours',  v_company.offline_limit_hours,
        'driver_coins',         v_company.driver_coins
    );
END;
$$;

-- ── 2. rpc_buy_auto_rest ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_auto_rest(
    p_cost_in_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
BEGIN
    IF p_cost_in_coins <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'costo non valido');
    END IF;

    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.auto_rest_enabled THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Auto-Rest già attivo');
    END IF;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET
        driver_coins      = driver_coins - p_cost_in_coins,
        auto_rest_enabled = true
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',               true,
        'auto_rest_enabled', v_company.auto_rest_enabled,
        'driver_coins',      v_company.driver_coins
    );
END;
$$;

-- ── 3. rpc_buy_energy_refill ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_energy_refill(
    p_cost_in_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
BEGIN
    IF p_cost_in_coins <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'costo non valido');
    END IF;

    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET
        driver_coins = driver_coins - p_cost_in_coins,
        ceo_energy   = 100
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',           true,
        'ceo_energy',   v_company.ceo_energy,
        'driver_coins', v_company.driver_coins
    );
END;
$$;

-- ── 4. rpc_buy_fleet_repair ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_fleet_repair(
    p_cost_in_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
BEGIN
    IF p_cost_in_coins <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'costo non valido');
    END IF;

    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins - p_cost_in_coins
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',           true,
        'driver_coins', v_company.driver_coins
    );
END;
$$;

-- ── 5. rpc_buy_vip_contact ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_vip_contact(
    p_cost_in_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
BEGIN
    IF p_cost_in_coins <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'costo non valido');
    END IF;

    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins - p_cost_in_coins
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',           true,
        'driver_coins', v_company.driver_coins
    );
END;
$$;

-- ── 6. rpc_buy_hr_automation ──────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_buy_hr_automation(
    v_cost_in_coins INT,
    v_days          INT DEFAULT 7
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_company companies%ROWTYPE;
    v_expires TIMESTAMPTZ;
BEGIN
    IF v_cost_in_coins <= 0 THEN
        RAISE EXCEPTION 'Costo non valido: %', v_cost_in_coins;
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;

    IF v_company.driver_coins < v_cost_in_coins THEN
        RAISE EXCEPTION 'Driver Coins insufficienti: hai % DC, servono % DC',
            v_company.driver_coins, v_cost_in_coins;
    END IF;

    -- Se il buff è già attivo, estendi dalla scadenza attuale; altrimenti da ora
    v_expires := GREATEST(NOW(), COALESCE(v_company.hr_automation_expires_at, NOW()))
                 + (v_days || ' days')::INTERVAL;

    UPDATE companies
       SET driver_coins              = driver_coins - v_cost_in_coins,
           hr_automation_expires_at  = v_expires
     WHERE user_id = auth.uid();

    RETURN jsonb_build_object(
        'success',    true,
        'expires_at', v_expires,
        'days',       v_days,
        'cost_dc',    v_cost_in_coins
    );
END;
$$;

-- Nessun nuovo GRANT necessario: la firma non cambia, i GRANT esistenti
-- (05_mmo_driver_coins.sql / 12_hr_automation.sql) restano validi.

-- ================================================================
-- FINE 51_lockdown_driver_coins_negative_cost_scaffold.sql
--
-- Verifica raccomandata prima di applicare (stesso schema di
-- `49_lockdown_critical_cash_rpcs_scaffold.sql`): in transazione con
-- ROLLBACK forzato, per ciascuna RPC —
--   1. costo negativo (es. -50000)      → deve fallire, saldo invariato
--   2. costo zero                       → deve fallire, saldo invariato
--   3. costo positivo legittimo         → deve riuscire come prima
--   4. saldo insufficiente (invariato)  → deve fallire come prima
-- ================================================================
