-- ============================================================
-- 29_infrastructure_monopoly.sql — Chauffeur Empire
-- Espansione 12: Monopolio Infrastrutture
-- ============================================================

-- Tabella depositi carburante (max 1 per provincia)
CREATE TABLE IF NOT EXISTS fuel_depots (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    province_id  TEXT         NOT NULL UNIQUE REFERENCES provinces(id) ON DELETE CASCADE,
    owner_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    markup_pct   NUMERIC(4,2) NOT NULL DEFAULT 10.00  CHECK (markup_pct BETWEEN 0 AND 50),
    price_paid   BIGINT       NOT NULL,
    total_earned BIGINT       NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE fuel_depots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "depots_read_all" ON fuel_depots;
CREATE POLICY "depots_read_all" ON fuel_depots FOR SELECT USING (true);
DROP POLICY IF EXISTS "depots_write_rpc" ON fuel_depots;
CREATE POLICY "depots_write_rpc" ON fuel_depots FOR ALL USING (false) WITH CHECK (false);

ALTER PUBLICATION supabase_realtime ADD TABLE fuel_depots;

-- ─── RPC: Acquista un deposito carburante ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_fuel_depot(
    v_province_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_company   companies%ROWTYPE;
    v_prov      provinces%ROWTYPE;
    v_cost      BIGINT := 300000;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Provincia non trovata: %', v_province_id; END IF;

    IF EXISTS (SELECT 1 FROM fuel_depots WHERE province_id = v_province_id) THEN
        RAISE EXCEPTION 'Questa provincia ha già un deposito carburante';
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;
    IF v_company.cash < v_cost THEN
        RAISE EXCEPTION 'Fondi insufficienti: hai €%, servono €%', v_company.cash, v_cost;
    END IF;

    UPDATE companies SET cash = cash - v_cost WHERE user_id = v_uid;

    INSERT INTO fuel_depots (province_id, owner_user_id, markup_pct, price_paid)
    VALUES (v_province_id, v_uid, 10.00, v_cost);

    INSERT INTO global_news (category, title, body, icon)
    VALUES (
        'infrastructure',
        '⛽ Nuovo deposito in ' || v_prov.name,
        COALESCE(v_company.company_name, 'Un''azienda') || ' ha aperto un deposito carburante in ' || v_prov.name || '. Tutti i trasporti in questa provincia ora pagano un markup.',
        '⛽'
    );

    RETURN jsonb_build_object(
        'success',      true,
        'province_id',  v_province_id,
        'province_name',v_prov.name,
        'cost',         v_cost
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_buy_fuel_depot(TEXT) TO authenticated;

-- ─── RPC: Imposta markup carburante ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_set_fuel_markup(
    v_province_id TEXT,
    v_markup_pct  NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_markup_pct < 0 OR v_markup_pct > 50 THEN RAISE EXCEPTION 'Markup deve essere tra 0%% e 50%%'; END IF;

    UPDATE fuel_depots
       SET markup_pct = v_markup_pct
     WHERE province_id = v_province_id AND owner_user_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Non possiedi un deposito in questa provincia';
    END IF;

    RETURN jsonb_build_object('success', true, 'markup_pct', v_markup_pct);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_set_fuel_markup(TEXT, NUMERIC) TO authenticated;

-- ─── RPC: Paga il levy carburante dopo una corsa ───────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_pay_fuel_levy(
    v_province_id TEXT,
    v_fare        BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_depot     fuel_depots%ROWTYPE;
    v_levy      BIGINT;
BEGIN
    IF v_uid IS NULL THEN RETURN jsonb_build_object('skipped', 'not_auth'); END IF;

    SELECT * INTO v_depot FROM fuel_depots WHERE province_id = v_province_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('skipped', 'no_depot'); END IF;
    IF v_depot.owner_user_id = v_uid THEN RETURN jsonb_build_object('skipped', 'self_owned'); END IF;

    -- Levy = markup% del carburante stimato (≈3% della tariffa = costo carburante medio)
    v_levy := GREATEST(10, FLOOR(v_fare * 0.03 * v_depot.markup_pct / 100.0));

    -- Verifica che il chiamante abbia abbastanza cash
    IF NOT EXISTS (SELECT 1 FROM companies WHERE user_id = v_uid AND cash >= v_levy) THEN
        RETURN jsonb_build_object('skipped', 'insufficient_cash');
    END IF;

    UPDATE companies SET cash = cash - v_levy WHERE user_id = v_uid;
    UPDATE companies SET cash = cash + v_levy WHERE user_id = v_depot.owner_user_id;
    UPDATE fuel_depots SET total_earned = total_earned + v_levy WHERE id = v_depot.id;

    RETURN jsonb_build_object('levy', v_levy, 'depot_owner', v_depot.owner_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_pay_fuel_levy(TEXT, BIGINT) TO authenticated;

-- ─── RPC: Ottieni tutti i depositi ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_fuel_depots()
RETURNS TABLE (
    depot_id       UUID,
    province_id    TEXT,
    province_name  TEXT,
    owner_user_id  UUID,
    owner_company  TEXT,
    markup_pct     NUMERIC,
    price_paid     BIGINT,
    total_earned   BIGINT,
    is_mine        BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fd.id,
        fd.province_id,
        p.name,
        fd.owner_user_id,
        c.company_name,
        fd.markup_pct,
        fd.price_paid,
        fd.total_earned,
        (fd.owner_user_id = auth.uid())
    FROM fuel_depots fd
    JOIN provinces p ON p.id = fd.province_id
    JOIN companies c ON c.user_id = fd.owner_user_id
    ORDER BY fd.total_earned DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_fuel_depots() TO authenticated;
