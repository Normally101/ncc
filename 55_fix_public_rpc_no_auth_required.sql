-- ============================================================================
-- 55_fix_public_rpc_no_auth_required.sql
-- FIX HIGH: due RPC raggiungibili senza alcuna autenticazione (GRANT ad anon),
-- entrambe scrivono dati globali visibili a tutti i giocatori.
--
-- rpc_spawn_judicial_auction(v_lot_type, v_tier, v_min_bid, v_duration_days):
-- crea un lotto d'asta giudiziaria pubblico. Zero call-site nel client
-- (grep sull'intero repo .js — mai chiamata), quindi era verosimilmente
-- pensata per un cron/admin job mai completato. Essendo GRANTata ad anon,
-- chiunque può chiamarla via REST diretto (curl, senza nemmeno un account)
-- per spammare aste fasulle o generare min_bid artificiosamente bassi su
-- lotti di tier alto (rpc_place_auction_bid è già ben protetta — verificata
-- in una sessione precedente — quindi il danno diretto in cash è limitato,
-- ma resta un vettore di spam/manipolazione del sistema aste). Fix: REVOKE
-- completo, nessuna regressione (nessun client la usa).
--
-- rpc_broadcast_news(p_company_name, p_message, p_type): scrive nel feed
-- pubblico global_news. Chiamata legittimamente da engine.js:2000-2009
-- (_broadcastNews), sempre col proprio company_name — ma essendo GRANTata
-- anche ad anon, chiunque senza login può inserire messaggi arbitrari nel
-- feed spacciandosi per qualunque azienda (spam/disinformazione pubblica).
-- Fix minimo: richiede auth.uid() non nullo — il client la chiama solo se
-- window.currentUser esiste già, quindi nessuna regressione per l'uso
-- legittimo. Non validiamo qui che p_company_name corrisponda al vero nome
-- azienda del chiamante (rischio residuo basso, solo narrativo/spam tra
-- utenti autenticati, non economico) — fuori scope per questo fix mirato.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.rpc_spawn_judicial_auction(text, text, bigint, integer)
FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.rpc_broadcast_news(p_company_name text, p_message text, p_type text DEFAULT 'info'::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'rpc_broadcast_news: non autenticato';
    END IF;
    INSERT INTO global_news (company_name, message, type)
    VALUES (p_company_name, p_message, p_type);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_broadcast_news(text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_broadcast_news(text, text, text) TO authenticated;
