-- =============================================================================
-- 66_registro_economia_osservazione.sql
-- Chauffeur Empire — Il registro dell'economia, in MODALITÀ OSSERVAZIONE.
-- IDEMPOTENT: safe to re-run.
-- =============================================================================
-- Porta in produzione le sezioni 1-3 di `42_economy_ledger_scaffold.sql`, che
-- era rimasto scaffold per UN SOLO motivo, dichiarato nella sua spec
-- (docs/ECONOMY_SERVER_AUTH.md):
--
--   «La MAGNITUDINE DEI TETTI dipende dalla scala economica legittima, ancora
--    INDECISA. Mettere tetti sbagliati bloccherebbe i guadagni veri.»
--
-- Quell'ostacolo è caduto il 28/08/2026: il bilanciamento economico ha fissato
-- la scala su numeri MISURATI (incasso mediano di una corsa €360; contratto
-- aziendale tier 5 sceso da €137.600 a €17.200/giorno; tetto ×4 sul
-- moltiplicatore d'incasso, picco leggendario ~€16.800).
--
-- ⚠️  QUESTA MIGRAZIONE NON CAMBIA IL COMPORTAMENTO DEL GIOCO.
--     Non rifiuta nessun movimento, non tocca nessun guadagno, non attiva
--     nessun blocco. Aggiunge SOLO un registro che annota cosa succede.
--     Il trigger di enforcement resta commentato in 42_ e li' deve restare
--     finché la fase 3 (migrare tutte le scritture cassa alle RPC a delta)
--     non è completata: accenderlo prima romperebbe ogni guadagno legittimo.
--
-- PERCHÉ «osservazione» e non subito enforcement: i tetti per-reason sono la
-- parte che non si può indovinare. Invece di sceglierli a occhio e scoprire sul
-- vivo di aver bloccato un incasso vero, ogni riga registra ANCHE se il
-- movimento SAREBBE stato rifiutato (colonna `oltre_tetto`). Dopo qualche
-- giorno di gioco reale la calibrazione si LEGGE dai dati:
--
--   SELECT reason, count(*), max(abs(delta))
--     FROM public.cash_ledger WHERE oltre_tetto GROUP BY reason ORDER BY 2 DESC;
--
-- Ogni riga di quel risultato è un tetto da alzare PRIMA di accendere qualsiasi
-- blocco. Se la query è vuota per giorni, i tetti reggono.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LEDGER append-only — l'estratto conto di ogni movimento
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_ledger (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    delta           BIGINT      NOT NULL,            -- +guadagno / −spesa
    balance_after   BIGINT      NOT NULL,            -- saldo risultante (denormalizzato per audit)
    reason          TEXT        NOT NULL,            -- causale (es. 'ride_earnings', 'buy_fuel_for_depot')
    source          TEXT        NOT NULL DEFAULT 'rpc', -- 'rpc' | 'mirror' | 'stripe' | 'admin' | 'migration'
    idempotency_key TEXT,                            -- opzionale: dedup di accrediti ripetuti
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La colonna che rende «osservazione» diversa da «enforcement»: il movimento
-- passa comunque, ma resta scritto che il tetto lo avrebbe rifiutato.
ALTER TABLE public.cash_ledger
    ADD COLUMN IF NOT EXISTS oltre_tetto BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS cash_ledger_idem_uniq
    ON public.cash_ledger (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cash_ledger_user_time
    ON public.cash_ledger (user_id, created_at DESC);
-- Indice mirato sulla domanda che questa migrazione esiste per rispondere:
-- «quali causali hanno sfondato il tetto?». Parziale: le righe oltre il tetto
-- sono (e devono restare) una piccolissima minoranza.
CREATE INDEX IF NOT EXISTS cash_ledger_oltre_tetto
    ON public.cash_ledger (reason, created_at DESC)
    WHERE oltre_tetto;

ALTER TABLE public.cash_ledger ENABLE ROW LEVEL SECURITY;

-- Lettura: solo le proprie righe. Scrittura: NESSUNA via API (solo RPC/service-role).
DROP POLICY IF EXISTS cash_ledger_select_own ON public.cash_ledger;
CREATE POLICY cash_ledger_select_own ON public.cash_ledger
    FOR SELECT USING (user_id = auth.uid());
-- (Nessuna policy INSERT/UPDATE/DELETE → bloccate per anon/authenticated.)


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CATALOGO TETTI per-reason — calibrato sui numeri misurati, non a occhio
-- ─────────────────────────────────────────────────────────────────────────────
-- Tetto massimo per SINGOLA chiamata. È un controllo di SANITÀ, non di
-- bilanciamento: deve lasciare passare comodamente il caso legittimo più
-- estremo e fermare solo l'assurdo. Dove la scala non è misurata si mette un
-- default largo: un tetto inventato è peggio di nessun tetto, perché produce
-- falsi allarmi che insegnano a ignorare gli allarmi.
CREATE OR REPLACE FUNCTION public._econ_cap(p_reason TEXT)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_reason
        -- Corse: mediana €360, picco leggendario ~€16.800 col tetto ×4 sul
        -- moltiplicatore d'incasso introdotto il 28/08. ~3× di margine.
        WHEN 'ride_earnings'      THEN     50000::BIGINT
        -- Contratti aziendali: tier 5 = €17.200/giorno dopo il riequilibrio
        -- (era €137.600). ~10× di margine.
        WHEN 'corporate_contract' THEN    200000::BIGINT
        -- Chiusura di giornata: è un AGGREGATO (incassi − stipendi − costi),
        -- non un singolo evento. Nel tardo gioco può essere grosso.
        WHEN 'daily_net_profit'   THEN   5000000::BIGINT
        -- Rientro dopo assenza: fino a 7 giorni di accumulo (engine.js:878).
        WHEN 'offline'            THEN  50000000::BIGINT
        -- Mercato fra giocatori e acquisti di catalogo: l'oggetto più caro del
        -- gioco è la Tower a €45.000.000, il jet Embraer €18.000.000. Stessa
        -- soglia già in vigore su rpc_sync_cash (49_/50_), quindi non introduce
        -- un secondo numero da indovinare.
        WHEN 'p2p_sale'           THEN  60000000::BIGINT
        WHEN 'stripe'             THEN 100000000::BIGINT
        -- Default: sopra qualunque movimento osservato, sotto l'assurdo.
        ELSE                            10000000::BIGINT
    END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC A DELTA — pronte per la fase 3, INERTI finché nessuno le chiama
-- ─────────────────────────────────────────────────────────────────────────────
-- Il client non SETta mai la cassa assoluta: manda un delta e una causale, e il
-- server decide. Nessun file .js le chiama ancora: esistono perché la fase 3
-- (migrare le ~30 scritture `companies SET cash` sparse negli .sql) trovi il
-- terreno pronto. Crearle ora non cambia nulla; crearle dopo sarebbe un secondo
-- cantiere aperto mentre si migra.

CREATE OR REPLACE FUNCTION public.rpc_earn(
    p_delta  BIGINT,
    p_reason TEXT,
    p_source TEXT DEFAULT 'rpc',
    p_idem   TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_cap BIGINT;
    v_new BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF p_delta IS NULL OR p_delta <= 0 THEN RAISE EXCEPTION 'delta non valido (atteso > 0)'; END IF;

    v_cap := public._econ_cap(p_reason);
    IF p_delta > v_cap THEN
        RAISE EXCEPTION 'delta % oltre il tetto % per reason %', p_delta, v_cap, p_reason;
    END IF;

    -- Idempotenza: se la chiave è già stata processata, ritorna il saldo corrente
    -- senza accreditare (un doppio clic non deve pagare due volte).
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
GRANT EXECUTE ON FUNCTION public.rpc_earn(BIGINT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_spend(
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
GRANT EXECUTE ON FUNCTION public.rpc_spend(BIGINT, TEXT, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_sync_cash — STESSO COMPORTAMENTO, più la riga di registro
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️  Il corpo qui sotto è quello LIVE letto con pg_get_functiondef prima di
--     scrivere questa migrazione (indurimento di 49_ + 50_: tetto sui soli
--     INCREMENTI a +€60.000.000, rate-limit 30/min, lock FOR UPDATE, nessun
--     tetto sui decrementi perché non sono un vettore di exploit e
--     companies_cash_check fa da pavimento). NON toccare quella logica: qui si
--     aggiunge SOLO la scrittura nel registro. Il rischio numero uno di questo
--     file è perdere l'indurimento riscrivendo la funzione.
--
-- Il DROP prima del CREATE non è opzionale: `rpc_sync_cash(BIGINT)` e
-- `rpc_sync_cash(BIGINT, TEXT DEFAULT NULL)` coesistenti renderebbero AMBIGUA
-- ogni chiamata a un solo argomento, rompendo il gioco per i client in cache.
-- Con la sola versione a due argomenti e il default, `{v_cash: N}` continua a
-- risolvere: i client vecchi funzionano e loggano con causale 'unknown'.
DROP FUNCTION IF EXISTS public.rpc_sync_cash(BIGINT);

CREATE OR REPLACE FUNCTION public.rpc_sync_cash(v_cash BIGINT, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_cash_prev  BIGINT;
    v_delta      BIGINT;
    v_reason     TEXT;
    v_oltre      BOOLEAN;
    -- ── FIX (50_): tetto di sicurezza solo sugli INCREMENTI ──
    v_max_increase CONSTANT BIGINT := 60000000;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Non autenticato';
    END IF;

    PERFORM public._ce_rate_limit('sync_cash', 30, interval '1 minute');

    SELECT cash INTO v_cash_prev FROM companies WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    v_delta := v_cash - v_cash_prev;
    IF v_delta > v_max_increase THEN
        RAISE EXCEPTION 'rpc_sync_cash: incremento cassa fuori range (% → %, delta +%, max +%)',
            v_cash_prev, v_cash, v_delta, v_max_increase;
    END IF;
    -- Nessun tetto sui decrementi: mai un vettore di exploit (solo auto-danno),
    -- e companies_cash_check (CHECK cash >= 0) resta comunque attivo come pavimento.

    UPDATE companies
       SET cash       = v_cash,
           updated_at = NOW()
     WHERE user_id = v_uid;

    -- ── REGISTRO (osservazione) ──────────────────────────────────────────────
    -- Un delta nullo non è un movimento: non merita una riga (syncCash viene
    -- chiamata anche in situazioni dove il saldo non cambia, e riempire il
    -- registro di righe a zero renderebbe illeggibile ciò che conta).
    IF v_delta <> 0 THEN
        -- La causale la decide il CLIENT solo come etichetta; il valore lo ha
        -- già deciso il server sopra. Nessuna riga può alterare la cassa.
        v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'unknown');
        -- Tronca: `reason` finisce in un indice, e un client malevolo potrebbe
        -- mandare una stringa enorme per gonfiare la tabella.
        v_reason := LEFT(v_reason, 64);
        v_oltre  := ABS(v_delta) > public._econ_cap(v_reason);

        -- Il registro non deve MAI poter far fallire un movimento già avvenuto:
        -- se l'inserimento va storto il gioco continua, si perde una riga di log.
        BEGIN
            INSERT INTO public.cash_ledger (user_id, delta, balance_after, reason, source, oltre_tetto)
            VALUES (v_uid, v_delta, v_cash, v_reason, 'mirror', v_oltre);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object('success', true, 'cash', v_cash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_sync_cash(BIGINT, TEXT) TO authenticated;

-- =============================================================================
-- FINE 66_registro_economia_osservazione.sql
--
-- Come si legge il registro (nella dashboard SQL di Supabase):
--
--   -- Gli ultimi movimenti, con la loro causale:
--   SELECT created_at, reason, delta, balance_after, oltre_tetto
--     FROM public.cash_ledger ORDER BY id DESC LIMIT 50;
--
--   -- I tetti da alzare PRIMA di pensare all'enforcement:
--   SELECT reason, count(*) AS volte, max(abs(delta)) AS massimo
--     FROM public.cash_ledger WHERE oltre_tetto
--    GROUP BY reason ORDER BY volte DESC;
--
--   -- Quanto è coperto il catalogo delle causali (quante righe 'unknown'):
--   SELECT reason = 'unknown' AS senza_causale, count(*)
--     FROM public.cash_ledger GROUP BY 1;
-- =============================================================================
