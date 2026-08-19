-- ============================================================================
-- 57_fix_ipo_reputation_source_of_truth.sql
-- FIX HIGH (trovato da Gemini 3.7 Flash, verificato indipendentemente da
-- Claude): rpc_list_company_ipo validava il requisito di reputazione minima
-- (3.5★) leggendo public.leaderboard invece di public.companies.
--
-- Root cause: public.leaderboard è liberamente scrivibile dal client per la
-- propria riga (RLS "Users manage own leaderboard row" / "Ognuno aggiorna la
-- propria azienda", polcmd '*', user_id = auth.uid(), nessuna validazione
-- server-side del contenuto — stesso identico pattern già fixato in questa
-- sessione per rpc_donate_to_alliance, FIX 4). Un utente poteva fare
-- `supabase.from('leaderboard').update({reputation: 5.0})` da devtools e
-- quotarsi in borsa senza possedere la reputazione minima reale.
--
-- companies.reputation è il campo autoritativo (aggiornato solo da RPC
-- server-side, es. rpc_claim_trip_reward: reputation = LEAST(5.0, ...+0.01)).
--
-- Nota: il messaggio d'errore usava già il pattern corretto di Postgres
-- (placeholder singolo `%` + valore pre-arrotondato con round(...,1) passato
-- come argomento, non un modificatore printf %.1f dentro la stringa) — non
-- c'è un bug di formattazione da correggere lì, solo la source of truth.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_list_company_ipo(v_ipo_price bigint, v_shares_total integer DEFAULT 1000)
RETURNS company_shares
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_listing public.company_shares;
    v_fee     bigint := 50000;
    v_cash    bigint;
    v_co_name text;
    v_rep     numeric;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;

    -- ── FIX: legge da companies (autoritativa), non da leaderboard (client-writable) ──
    SELECT reputation, company_name INTO v_rep, v_co_name
    FROM public.companies WHERE user_id = v_user_id;

    IF COALESCE(v_rep, 0) < 3.5 THEN
        RAISE EXCEPTION 'rpc_list_company_ipo: reputazione insufficiente (hai %★, servono 3.5★)', round(COALESCE(v_rep,0), 1);
    END IF;

    v_cash := public._get_player_cash(v_user_id);
    IF v_cash < v_fee THEN
        RAISE EXCEPTION 'rpc_list_company_ipo: fondi insufficienti (quota €50.000, hai €%)', v_cash;
    END IF;

    IF EXISTS (SELECT 1 FROM public.company_shares WHERE issuer_user_id = v_user_id) THEN
        RAISE EXCEPTION 'rpc_list_company_ipo: azienda gia quotata in borsa';
    END IF;

    PERFORM public._add_player_cash(v_user_id, -v_fee);

    INSERT INTO public.company_shares (issuer_user_id, company_name, shares_total, shares_available, ipo_price, current_price)
    VALUES (v_user_id, COALESCE(v_co_name, 'Chauffeur Empire'), v_shares_total, FLOOR(v_shares_total * 0.70)::int, v_ipo_price, v_ipo_price)
    RETURNING * INTO v_listing;

    INSERT INTO public.share_holdings (listing_id, owner_user_id, shares_owned, avg_buy_price)
    VALUES (v_listing.id, v_user_id, FLOOR(v_shares_total * 0.30)::int, v_ipo_price);

    RETURN v_listing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_list_company_ipo(bigint, integer) TO authenticated;
