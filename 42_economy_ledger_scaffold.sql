-- =============================================================================
-- 42_economy_ledger_scaffold.sql
-- Chauffeur Empire — SCAFFOLDING economia server-authoritative (ledger + RPC a-delta)
-- IDEMPOTENT: safe to re-run.
-- =============================================================================
-- ⚠️  STATO 28/08/2026: le sezioni 1-3 di questo file SONO STATE APPLICATE a
--     produzione, ma tramite `66_registro_economia_osservazione.sql` (che le
--     riporta con i tetti CALIBRATI sui numeri misurati e una colonna in piu',
--     `oltre_tetto`). Questo file resta come storico della progettazione: NON
--     va girato cosi' com'e', avrebbe i tetti placeholder. La sezione 4
--     (trigger di enforcement) e' l'unica ancora da fare, e va accesa solo
--     dopo la fase 3. (storico dell'avviso originale:)
-- ⚠️  NON ANCORA APPLICATO A PROD — DA RIVEDERE PRIMA DI GIRARLO.
--     Chiude il DEBITO DI SICUREZZA #1 (economia client-authoritative).
--     Spec + fasi di migrazione: docs/ECONOMY_SERVER_AUTH.md
--
--     Questo file CREA l'infrastruttura (tabella + RPC + trigger template) ma è
--     INERTE finché le RPC non vengono chiamate. Il trigger di ENFORCEMENT è
--     volutamente COMMENTATO (sezione 4): attivarlo PRIMA di aver migrato tutte
--     le scritture cassa esistenti romperebbe ogni guadagno legittimo.
--
--     I tetti per-reason in _econ_cap() sono PLACEHOLDER: vanno calibrati con la
--     scala economica reale (Decisioni Aperte #6) prima dell'enforcement.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LEDGER append-only — audit trail + sorgente di verità ricostruibile
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_ledger (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    delta           BIGINT      NOT NULL,            -- +guadagno / −spesa
    balance_after   BIGINT      NOT NULL,            -- saldo risultante (denormalizzato per audit)
    reason          TEXT        NOT NULL,            -- chiave catalogo (es. 'ride', 'contract', 'province_tax')
    source          TEXT        NOT NULL DEFAULT 'rpc', -- 'rpc' | 'stripe' | 'admin' | 'migration'
    idempotency_key TEXT,                            -- opzionale: dedup di accrediti ripetuti
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_ledger_idem_uniq
    ON public.cash_ledger (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cash_ledger_user_time
    ON public.cash_ledger (user_id, created_at DESC);

ALTER TABLE public.cash_ledger ENABLE ROW LEVEL SECURITY;

-- Lettura: solo le proprie righe. Scrittura: NESSUNA via API (solo RPC/service-role).
DROP POLICY IF EXISTS cash_ledger_select_own ON public.cash_ledger;
CREATE POLICY cash_ledger_select_own ON public.cash_ledger
    FOR SELECT USING (user_id = auth.uid());
-- (Nessuna policy INSERT/UPDATE/DELETE → bloccate per gli anon/authenticated.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CATALOGO TETTI per-reason (server-side) — PLACEHOLDER da calibrare
--    Il client manda SOLO la reason; il tetto/segno lo decide il server.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _econ_cap(p_reason TEXT)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
    -- Tetto massimo per SINGOLA chiamata (sanity, non bilanciamento). PLACEHOLDER.
    SELECT CASE p_reason
        WHEN 'ride'         THEN 5000::BIGINT
        WHEN 'contract'     THEN 5000000::BIGINT
        WHEN 'province_tax' THEN 2000000::BIGINT
        WHEN 'offline'      THEN 50000000::BIGINT   -- catchup idle può essere grosso
        WHEN 'p2p_sale'     THEN 50000000::BIGINT
        WHEN 'stripe'       THEN 100000000::BIGINT
        ELSE 1000000::BIGINT                        -- default conservativo
    END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC a-delta — il client non SETta mai la cassa assoluta
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. GUADAGNO: cash += delta (delta > 0), validato + idempotente + loggato.
CREATE OR REPLACE FUNCTION rpc_earn(
    p_delta  BIGINT,
    p_reason TEXT,
    p_source TEXT DEFAULT 'rpc',
    p_idem   TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_cap     BIGINT;
    v_new     BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF p_delta IS NULL OR p_delta <= 0 THEN RAISE EXCEPTION 'delta non valido (atteso > 0)'; END IF;

    v_cap := _econ_cap(p_reason);
    IF p_delta > v_cap THEN
        RAISE EXCEPTION 'delta % oltre il tetto % per reason %', p_delta, v_cap, p_reason;
    END IF;

    -- Idempotenza: se la chiave è già stata processata, ritorna il saldo corrente senza accreditare.
    IF p_idem IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.cash_ledger WHERE user_id = v_uid AND idempotency_key = p_idem
    ) THEN
        SELECT cash INTO v_new FROM public.companies WHERE user_id = v_uid;
        RETURN jsonb_build_object('success', true, 'cash', v_new, 'dedup', true);
    END IF;

    UPDATE public.companies
       SET cash = cash + p_delta, updated_at = NOW()
     WHERE user_id = v_uid
     RETURNING cash INTO v_new;
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;

    INSERT INTO public.cash_ledger (user_id, delta, balance_after, reason, source, idempotency_key)
    VALUES (v_uid, p_delta, v_new, p_reason, COALESCE(p_source, 'rpc'), p_idem);

    RETURN jsonb_build_object('success', true, 'cash', v_new);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_earn(BIGINT, TEXT, TEXT, TEXT) TO authenticated;

-- 3b. SPESA: cash -= delta (delta > 0), con fondi sufficienti, lock anti-race, loggata.
CREATE OR REPLACE FUNCTION rpc_spend(
    p_delta  BIGINT,
    p_reason TEXT,
    p_idem   TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_cur BIGINT;
    v_new BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF p_delta IS NULL OR p_delta <= 0 THEN RAISE EXCEPTION 'delta non valido (atteso > 0)'; END IF;

    SELECT cash INTO v_cur FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;
    IF v_cur < p_delta THEN RAISE EXCEPTION 'Fondi insufficienti'; END IF;

    v_new := v_cur - p_delta;
    UPDATE public.companies SET cash = v_new, updated_at = NOW() WHERE user_id = v_uid;

    INSERT INTO public.cash_ledger (user_id, delta, balance_after, reason, source, idempotency_key)
    VALUES (v_uid, -p_delta, v_new, p_reason, 'rpc', p_idem);

    RETURN jsonb_build_object('success', true, 'cash', v_new);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_spend(BIGINT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER DI ENFORCEMENT — ⚠️ COMMENTATO DI PROPOSITO
--    Attivare SOLO dopo la fase 3 della migrazione (tutte le scritture cassa
--    passano per rpc_earn/rpc_spend). Prima di allora bloccherebbe i guadagni
--    legittimi. Vedi docs/ECONOMY_SERVER_AUTH.md → Fasi.
--
--    Idea: marcare le RPC autorizzate con una GUC di sessione e far RAISE il
--    trigger se cash cambia senza quel flag.
--
-- CREATE OR REPLACE FUNCTION _enforce_cash_via_rpc()
-- RETURNS TRIGGER LANGUAGE plpgsql AS $$
-- BEGIN
--     IF NEW.cash IS DISTINCT FROM OLD.cash
--        AND current_setting('ce.cash_rpc', true) IS DISTINCT FROM 'on' THEN
--         RAISE EXCEPTION 'cash mutabile solo via rpc_earn/rpc_spend';
--     END IF;
--     RETURN NEW;
-- END;
-- $$;
-- CREATE TRIGGER trg_enforce_cash BEFORE UPDATE ON public.companies
--     FOR EACH ROW EXECUTE FUNCTION _enforce_cash_via_rpc();
--   (e in rpc_earn/rpc_spend: PERFORM set_config('ce.cash_rpc','on',true); prima dell'UPDATE)

-- =============================================================================
-- FINE 42_economy_ledger_scaffold.sql
-- =============================================================================
