-- ============================================================
-- 22_server_decrees.sql — Chauffeur Empire
-- Espansione 5: Lobbying Politico — Decreti Server (collettivi)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.server_decrees (
    id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    title           TEXT    NOT NULL,
    description     TEXT,
    icon            TEXT    DEFAULT '📜',
    effects         JSONB   NOT NULL DEFAULT '{}',
    -- effects: { tipMult, xpMult, fuelCostMult, maintenanceMult, licenseCostMult,
    --            taxRateMult, extraRidePct, vehiclePriceMult }
    votes_required  INT     NOT NULL DEFAULT 50,
    votes_current   INT     NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'voting',  -- voting | passed | rejected | expired
    expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    passed_at       TIMESTAMPTZ DEFAULT NULL,
    duration_days   INT     DEFAULT NULL,  -- NULL = permanent once passed
    ends_at         TIMESTAMPTZ DEFAULT NULL,  -- when effect expires (if duration_days set)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.decree_votes (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    decree_id   UUID    NOT NULL REFERENCES public.server_decrees(id) ON DELETE CASCADE,
    user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    points_spent INT    NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(decree_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_decrees_status ON public.server_decrees(status);
CREATE INDEX IF NOT EXISTS idx_decree_votes_decree   ON public.decree_votes(decree_id);
CREATE INDEX IF NOT EXISTS idx_decree_votes_user     ON public.decree_votes(user_id);

ALTER TABLE public.server_decrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decree_votes   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "decrees_public_read"
      ON public.server_decrees FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "decree_votes_public_read"
      ON public.decree_votes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "decree_votes_own_insert"
      ON public.decree_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: decreti iniziali in votazione ──────────────────────────────────────

INSERT INTO public.server_decrees (title, description, icon, effects, votes_required, expires_at)
VALUES
    ('Detraibilità IVA Autotrasporto',
     'Deduzione IVA al 100% per veicoli NCC. Riduce i costi di manutenzione per tutti.',
     '🧾',
     '{"maintenanceMult":0.85,"licenseCostMult":0.90}',
     30,
     NOW() + INTERVAL '7 days'),

    ('Zona Franca Aeroportuale',
     'Esenzione tasse per transfer aeroportuali. Aumenta guadagni su tutte le corse hub.',
     '✈️',
     '{"tipMult":1.15,"forceAirport":true}',
     40,
     NOW() + INTERVAL '10 days'),

    ('Carburante Agevolato NCC',
     'Accesso alla rete carburante statale a prezzi ridotti per flotte NCC certificate.',
     '⛽',
     '{"fuelCostMult":0.80}',
     25,
     NOW() + INTERVAL '14 days'),

    ('Licenza NCC Temporanea — Stagionale',
     'Licenze temporanee a basso costo per la stagione turistica. +30% corse disponibili.',
     '📋',
     '{"extraRidePct":0.30,"licenseCostMult":0.70}',
     50,
     NOW() + INTERVAL '21 days'),

    ('Piano Marshall Veicoli Elettrici',
     'Sussidi governativi per EV nel settore NCC. Veicoli elettrici -20% di prezzo.',
     '⚡',
     '{"vehiclePriceMult":0.80}',
     60,
     NOW() + INTERVAL '30 days'),

    ('Blitz Anti-Abusivismo',
     'Operazione GdF contro NCC abusivi. I giocatori onesti guadagnano +10% su tutte le corse.',
     '🛡️',
     '{"tipMult":1.10,"xpMult":1.10}',
     35,
     NOW() + INTERVAL '5 days'),

    ('Flat Tax NCC al 15%',
     'Tassazione agevolata per imprese NCC sotto i 10M di fatturato. −15% tasse giornaliere.',
     '💶',
     '{"taxRateMult":0.85}',
     80,
     NOW() + INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Lista decreti con voto dell'utente corrente
CREATE OR REPLACE FUNCTION public.rpc_get_server_decrees()
RETURNS TABLE (
    id              UUID,
    title           TEXT,
    description     TEXT,
    icon            TEXT,
    effects         JSONB,
    votes_required  INT,
    votes_current   INT,
    status          TEXT,
    expires_at      TIMESTAMPTZ,
    passed_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    my_votes        INT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        d.id, d.title, d.description, d.icon, d.effects,
        d.votes_required, d.votes_current, d.status,
        d.expires_at, d.passed_at, d.ends_at,
        COALESCE((SELECT v.points_spent FROM public.decree_votes v
                  WHERE v.decree_id = d.id AND v.user_id = v_uid), 0)::INT AS my_votes
    FROM public.server_decrees d
    WHERE d.status IN ('voting', 'passed')
      AND (d.ends_at IS NULL OR d.ends_at > NOW())
    ORDER BY
        CASE d.status WHEN 'voting' THEN 0 ELSE 1 END,
        d.expires_at ASC;
END;
$$;

-- Vota un decreto (spende lobbying points dal gameState — validato client-side)
-- Il server si fida del client per i lobbying points (sono client-side)
-- Ma manteniamo unicità del voto per utente per decreto
CREATE OR REPLACE FUNCTION public.rpc_vote_server_decree(
    v_decree_id    UUID,
    v_points_spent INT  DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_decree    public.server_decrees%ROWTYPE;
    v_prev      INT := 0;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_points_spent < 1 THEN RAISE EXCEPTION 'Vota almeno 1 punto'; END IF;

    SELECT * INTO v_decree FROM public.server_decrees WHERE id = v_decree_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decreto non trovato'; END IF;
    IF v_decree.status != 'voting' THEN RAISE EXCEPTION 'Decreto non in votazione'; END IF;
    IF v_decree.expires_at < NOW() THEN RAISE EXCEPTION 'Votazione scaduta'; END IF;

    -- Voto precedente
    SELECT points_spent INTO v_prev FROM public.decree_votes
    WHERE decree_id = v_decree_id AND user_id = v_uid;

    -- Upsert voto
    INSERT INTO public.decree_votes (decree_id, user_id, points_spent)
    VALUES (v_decree_id, v_uid, v_points_spent)
    ON CONFLICT (decree_id, user_id) DO UPDATE SET points_spent = EXCLUDED.points_spent;

    -- Aggiorna contatore voti
    UPDATE public.server_decrees
    SET votes_current = (SELECT SUM(points_spent) FROM public.decree_votes WHERE decree_id = v_decree_id)
    WHERE id = v_decree_id;

    -- Controlla se approvato
    IF v_decree.votes_current + v_points_spent - COALESCE(v_prev, 0) >= v_decree.votes_required THEN
        UPDATE public.server_decrees
        SET status    = 'passed',
            passed_at = NOW(),
            ends_at   = CASE WHEN v_decree.duration_days IS NOT NULL
                              THEN NOW() + (v_decree.duration_days || ' days')::INTERVAL
                              ELSE NULL END
        WHERE id = v_decree_id;

        RETURN jsonb_build_object('passed', true, 'decree_id', v_decree_id, 'title', v_decree.title);
    END IF;

    RETURN jsonb_build_object('passed', false, 'votes_current', v_decree.votes_current + v_points_spent - COALESCE(v_prev, 0));
END;
$$;

-- Decreti attivi (passati) per applicazione effetti
CREATE OR REPLACE FUNCTION public.rpc_get_active_decrees()
RETURNS SETOF public.server_decrees
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT * FROM public.server_decrees
    WHERE status = 'passed'
      AND (ends_at IS NULL OR ends_at > NOW())
    ORDER BY passed_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_server_decrees()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_vote_server_decree(UUID, INT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_active_decrees()                    TO authenticated;
