-- ============================================================================
-- 64_dividendi_giornalieri_idempotenti.sql
--
-- FIX: rpc_daily_dividends() ora è idempotente e paga UNA VOLTA AL GIORNO.
--
-- Segue lo schema di 21_vtk_token.sql (vtk_today_reset < CURRENT_DATE) e di
-- 09_provinces_realestate_fuel.sql (last_rent_at).
--
-- Aggiunge la colonna `last_dividend_at` (DATE) su `company_shares` e `companies`.
-- La funzione verifica che `last_dividend_at < CURRENT_DATE` (o NULL) prima di
-- procedere, e aggiorna il segnalibro a `CURRENT_DATE` nella STESSA transazione.
-- Se per tutte le aziende i dividendi sono già stati distribuiti oggi,
-- restituisce un payload con status 'already_paid' ("già pagato") senza muovere cassa.
-- ============================================================================

-- ── 1. Colonna segnalibro ultimo giorno pagato ──────────────────────────────
ALTER TABLE public.company_shares
    ADD COLUMN IF NOT EXISTS last_dividend_at DATE DEFAULT NULL;

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS last_dividend_at DATE DEFAULT NULL;

-- ── 2. RPC rpc_daily_dividends con guardia giornaliera ─────────────────────
CREATE OR REPLACE FUNCTION public.rpc_daily_dividends()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec            record;
    v_count          int := 0;
    v_total_paid     bigint := 0;
    v_daily_rev      bigint;
    v_div_pool       bigint;
    v_holder         record;
    v_div_share      bigint;
    v_companies_paid int := 0;
    v_already_paid   int := 0;
BEGIN
    FOR v_rec IN SELECT * FROM public.company_shares LOOP
        -- Se l'azienda ha già distribuito i dividendi oggi, salta senza muovere cassa
        IF v_rec.last_dividend_at IS NOT NULL AND v_rec.last_dividend_at >= CURRENT_DATE THEN
            v_already_paid := v_already_paid + 1;
            CONTINUE;
        END IF;

        -- Leggi weeklyEarnings/7 come proxy del profitto giornaliero (simulazione)
        SELECT COALESCE((game_state->>'weeklyEarnings')::bigint / 7, 0)
        INTO v_daily_rev
        FROM public.game_saves
        WHERE user_id = v_rec.issuer_user_id AND slot_index = 0;

        v_daily_rev := COALESCE(v_daily_rev, 0);
        v_div_pool  := FLOOR(v_daily_rev * 0.10);

        IF v_div_pool > 0 THEN
            -- Distribuisci pro-quota a tutti gli holder ECCETTO l'emittente
            FOR v_holder IN
                SELECT sh.owner_user_id, sh.shares_owned
                FROM public.share_holdings sh
                WHERE sh.listing_id = v_rec.id
                  AND sh.owner_user_id <> v_rec.issuer_user_id
                  AND sh.shares_owned > 0
            LOOP
                v_div_share := FLOOR(v_div_pool * v_holder.shares_owned::numeric / v_rec.shares_total);
                IF v_div_share > 0 THEN
                    -- Lock ordinato su holder + issuer prima del cash (anti-deadlock)
                    PERFORM 1 FROM public.companies
                    WHERE user_id IN (v_holder.owner_user_id, v_rec.issuer_user_id)
                    ORDER BY user_id
                    FOR UPDATE;

                    PERFORM public._add_player_cash(v_holder.owner_user_id, v_div_share);
                    -- Scala il dividendo dal cash dell'emittente
                    PERFORM public._add_player_cash(v_rec.issuer_user_id, -v_div_share);
                    v_count := v_count + 1;
                    v_total_paid := v_total_paid + v_div_share;
                END IF;
            END LOOP;
        END IF;

        -- Aggiorna prezzo azione in base alle performance e salva il segnalibro last_dividend_at
        -- nella STESSA transazione
        UPDATE public.company_shares
        SET last_dividend_at = CURRENT_DATE,
            current_price = GREATEST(1,
                current_price + CASE
                    WHEN v_daily_rev > 50000 THEN CEIL(current_price * 0.03)
                    WHEN v_daily_rev > 10000 THEN CEIL(current_price * 0.01)
                    WHEN v_daily_rev < 1000  THEN -CEIL(current_price * 0.02)
                    ELSE 0
                END
            ),
            updated_at = now()
        WHERE id = v_rec.id;

        -- Aggiorna anche companies.last_dividend_at per tracciamento aziendale
        UPDATE public.companies
        SET last_dividend_at = CURRENT_DATE,
            updated_at = now()
        WHERE user_id = v_rec.issuer_user_id;

        v_companies_paid := v_companies_paid + 1;
    END LOOP;

    -- Se nessuna azienda doveva essere pagata (tutte già pagate oggi)
    IF v_companies_paid = 0 AND v_already_paid > 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_paid',
            'message', 'già pagato',
            'credited_count', 0,
            'total_paid', 0,
            'already_paid_count', v_already_paid
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'ok',
        'credited_count', v_count,
        'total_paid', v_total_paid,
        'companies_processed', v_companies_paid,
        'already_paid_count', v_already_paid
    );
END;
$$;

-- ── 3. Permessi ─────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.rpc_daily_dividends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_daily_dividends() TO authenticated, service_role;

-- ── 4. Sveglia cron consigliata ─────────────────────────────────────────────
-- Come per rpc_reset_daily_vtk (vedi 63_orologio_del_mondo.sql), la chiamata ogni
-- ora è sicura e idempotente: 23 no-op veloci e 1 esecuzione effettiva al giorno.
--
-- SELECT cron.schedule(
--     'dividendi-giornalieri-holding',
--     '15 * * * *',
--     $$SELECT public.rpc_daily_dividends();$$
-- );
