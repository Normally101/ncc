-- ============================================================================
-- 66_server_priced_dc_purchase.sql
--
-- FONDAMENTA ECONOMIA SUL SERVER — prezzo deciso dal server, mai dal browser.
--
-- Decisione Vlad (22/08/2026): «tutto cio' che riguarda l'economia del gioco
-- deve essere custodita dal server/database, non dal browser locale».
--
-- Oggi la spesa DC passa da rpc_ec_spend(p_item_id, p_amount): il browser
-- DICIDE il prezzo e lo manda. Chi apre gli strumenti da sviluppatore compra
-- l'Executive Pass a 1 DC. Questa migrazione aggiunge la forma corretta:
--
--   SBAGLIATO: browser calcola `saldo - prezzo` e comunica il risultato.
--   GIUSTO:    browser dice «voglio comprare X»; il server LEGGE IL PREZZO
--              da una sua tabella, blocca la riga del giocatore (FOR UPDATE),
--              controlla il saldo, scala lui e RESTITUISCE il saldo nuovo.
--
-- Modello: rpc_ec_spend (17_executive_club.sql) per lock+log+saldo restituito,
-- rpc_buy_energy_refill (07_mmo_core_loop.sql) per il prezzo letto dal server.
--
-- NOTA MIGRAZIONE: da APPLICARE su produzione (Vlad), non automaticamente.
-- ============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1: CATALOGO PREZZI — la fonte unica dei prezzi DC.
-- Il client NON puo' scrivere qui (RLS deny-all sotto): puo' solo leggerla.
-- unit_price = costo per UNITA'; min_total = addebito minimo assoluto
-- (replica i vecchi max(3, N*2) / max(4, N*2) dei bundle calcolati dal client).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dc_item_prices (
    item_id     TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    unit_price  INTEGER NOT NULL CHECK (unit_price > 0),
    min_total   INTEGER NOT NULL DEFAULT 1 CHECK (min_total > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO dc_item_prices (item_id, label, unit_price, min_total) VALUES
    ('executive_pass',      'Executive Pass 30 giorni',              150, 1),
    ('skip_construction',   'Costruzione completata istantaneamente',  8, 1),
    ('academy_skip',        'Corso accademia completato',              5, 1),
    ('fuel_boost',          'Flotta carburante 100%',                  3, 1),
    ('wake_driver',         'Autista svegliato',                       3, 1),
    ('energy_boost',        'Energia CEO 100%',                        4, 1),
    ('insta_heal',          'Autista guarito',                         2, 1),
    ('wake_all_drivers',    'Autista svegliato (bundle)',              2, 3),
    ('heal_all_drivers',    'Autista guarito (bundle)',                2, 4),
    ('ops_bundle',          'Pacchetto Operativo',                     9, 1),
    ('full_bundle',         'Pacchetto Imperiale',                    35, 1)
ON CONFLICT (item_id) DO NOTHING;

ALTER TABLE dc_item_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dc_prices_read_only" ON dc_item_prices;
CREATE POLICY "dc_prices_read_only" ON dc_item_prices FOR SELECT USING (true);
-- Nessuna policy di scrittura: solo SERVICE ROLE (migrazioni) modifica i prezzi.

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2: RPC DI ACQUISTO A PREZZO SERVER — rpc_dc_purchase
-- Riceve SOLO cosa comprare (id + quantita'). Prezzo, totale, controllo fondi,
-- addebito: tutto dentro il database. Restituisce il saldo nuovo.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_dc_purchase(
    p_item_id TEXT,
    p_units   INTEGER DEFAULT 1   -- quante unita' (autisti, corsi…), non il prezzo
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_unit     INTEGER;
    v_min_tot  INTEGER;
    v_balance  INTEGER;
    v_spent    INTEGER;
    v_new_bal  INTEGER;
    v_company  companies%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    IF p_units IS NULL OR p_units < 1 OR p_units > 500 THEN
        RAISE EXCEPTION 'Quantita'' non valida: %', p_units;
    END IF;

    -- Il prezzo arriva dalla TABELLA, mai dal parametro del client.
    SELECT unit_price, min_total INTO v_unit, v_min_tot
    FROM dc_item_prices WHERE item_id = p_item_id;
    IF v_unit IS NULL THEN
        RAISE EXCEPTION 'Articolo sconosciuto: %', p_item_id;
    END IF;

    -- Blocca la riga PRIMA di leggere il saldo: due acquisti in parallelo
    -- non devono poter spendere due volte gli stessi soldi.
    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    v_spent   := GREATEST(v_min_tot, v_unit * p_units);
    v_balance := v_company.driver_coins;

    IF v_balance < v_spent THEN
        RAISE EXCEPTION 'Driver Coins insufficienti: saldo %, servono %',
            v_balance, v_spent;
    END IF;

    -- Scala il server, non il browser…
    UPDATE companies
    SET driver_coins = driver_coins - v_spent
    WHERE user_id = v_user_id
    RETURNING driver_coins INTO v_new_bal;

    -- …e logga, stesso registro di rpc_ec_spend.
    INSERT INTO coin_transactions (user_id, company_name, amount, transaction_type, item_id, balance_after)
    VALUES (v_user_id, v_company.company_name, -v_spent, 'spend', p_item_id, v_new_bal);

    -- …e RESTITUISCE il saldo nuovo: e' questo che il browser scrive.
    RETURN jsonb_build_object(
        'ok',           true,
        'item_id',      p_item_id,
        'units',        p_units,
        'spent',        v_spent,
        'driver_coins', v_new_bal
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_dc_purchase(TEXT, INTEGER) TO authenticated;


-- =============================================================================
-- FINE 66_server_priced_dc_purchase.sql
-- Tabelle create: dc_item_prices (catalogo prezzi, RLS read-only)
-- RPC create: rpc_dc_purchase(p_item_id, p_units) -> { ok, spent, driver_coins }
-- =============================================================================
