-- ============================================================================
-- 54_fix_donate_to_alliance_cash_source_of_truth.sql
-- FIX CRITICAL: rpc_donate_to_alliance generava tesoro alleanza (fino a
-- €100.000.000/chiamata) e "contribution" (usata dal Punteggio Potere
-- anti-cheat in classifica, vedi ui-ranking.js:53-63) SENZA scalare un solo
-- euro dal cash del donatore.
--
-- Root cause: l'unico controllo di plausibilità era
--   select liquid_assets into v_assets from leaderboard where user_id = v_uid;
--   if p_amount > v_assets then raise exception ...
-- ma leaderboard.liquid_assets è un campo LIBERAMENTE scrivibile dal client:
-- la RLS su public.leaderboard ("Ognuno aggiorna la propria azienda" /
-- "Users manage own leaderboard row", polcmd '*') permette a qualunque
-- authenticated di fare UPDATE sulla propria riga senza alcuna validazione
-- server-side sul contenuto (saveSystem.js::_upsertLeaderboard scrive
-- Math.floor(saveData.cash||0) ma nulla impedisce di scrivere direttamente
-- un valore arbitrario da devtools). E soprattutto: anche passato quel
-- check, la funzione non faceva MAI un UPDATE su companies.cash — il
-- "donatore" non pagava letteralmente nulla.
--
-- Impatto verificato leggendo il codice: chiunque può gonfiare
-- leaderboard.liquid_assets (scrittura diretta o game_saves falsificato +
-- autosave), poi chiamare rpc_donate_to_alliance ripetutamente (nessun
-- rate-limit) per generare tesoro alleanza (sblocca perk reali via
-- rpc_activate_alliance_perk) e "contribution" — che alimenta DIRETTAMENTE
-- il Punteggio Potere in classifica, l'unica metrica esplicitamente
-- progettata per essere "a prova di cheat" perché non dipende dal cash
-- client-side (vedi ui-ranking.js riga 144). Questo la vanificava del tutto.
--
-- Fix: stesso pattern già in uso per rpc_sync_cash/_add_player_cash — legge
-- e scala companies.cash con FOR UPDATE (fonte autoritativa unica, non
-- leaderboard), più rate-limit difensivo. Firma, tetto (€100M) e resto della
-- logica (treasury, contribution, membership check) invariati.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_donate_to_alliance(p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_aid   uuid;
    v_tr    numeric;
    v_cash  bigint;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;
    IF p_amount > 100000000 THEN RAISE EXCEPTION 'Importo oltre il limite'; END IF;

    PERFORM public._ce_rate_limit('donate_to_alliance', 20, interval '1 minute');

    SELECT alliance_id INTO v_aid FROM alliance_members WHERE user_id = v_uid;
    IF v_aid IS NULL THEN RAISE EXCEPTION 'Non sei in un consorzio'; END IF;

    -- ── FIX: valida e scala da companies.cash (fonte autoritativa), non da
    -- leaderboard.liquid_assets (client-writable, mai realmente addebitato) ──
    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF v_cash IS NULL THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;
    IF p_amount > v_cash THEN
        RAISE EXCEPTION 'Fondi insufficienti (hai €%, doni €%)', v_cash, p_amount;
    END IF;

    UPDATE public.companies SET cash = cash - p_amount::bigint WHERE user_id = v_uid;

    UPDATE alliances SET treasury = treasury + p_amount WHERE id = v_aid RETURNING treasury INTO v_tr;
    UPDATE alliance_members SET contribution = contribution + p_amount
        WHERE alliance_id = v_aid AND user_id = v_uid;

    RETURN v_tr;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_donate_to_alliance(numeric) TO authenticated;
